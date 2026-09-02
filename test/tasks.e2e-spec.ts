import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { MongooseModule } from '@nestjs/mongoose';
import { ClerkModule } from '../src/clerk/clerk.module';
import { TasksModule } from '../src/tasks/tasks.module';
import { ClerkAuthGuard } from '../src/auth/guards/clerk-auth.guard';
import { ClerkService } from '../src/clerk/clerk.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { startInMemoryMongo, stopInMemoryMongo, clearCollections } from './setup-e2e';

const USER_A = 'uid-alice';
const USER_B = 'uid-bob';

/** Stub guard: reads the uid straight from the header, no Clerk involved. */
class StubAuthGuard {
  canActivate(ctx: any): boolean {
    const req = ctx.switchToHttp().getRequest();
    const uid = req.headers['x-test-uid'];
    if (!uid) return false;
    req.user = { uid, email: `${uid}@test.dev`, displayName: null, photoURL: null };
    return true;
  }
}

describe('Tasks (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const uri = await startInMemoryMongo();
    const moduleRef = await Test.createTestingModule({
      imports: [MongooseModule.forRoot(uri), ClerkModule, TasksModule],
    })
      .overrideGuard(ClerkAuthGuard)
      .useClass(StubAuthGuard)
      // ClerkService needs a real secret key to construct its client, but the
      // stub guard never calls it and tasks routes never touch ClerkService.
      .overrideProvider(ClerkService)
      .useValue({ client: {} })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterEach(() => clearCollections());
  afterAll(async () => { await app.close(); await stopInMemoryMongo(); });

  const post = (uid: string, body: unknown) =>
    request(app.getHttpServer()).post('/tasks').set('x-test-uid', uid).send(body);

  const validTask = {
    title: 'Deploy backend',
    startAt: '2026-09-03T09:00:00.000Z',
    deadline: '2026-09-03T11:00:00.000Z',
    priority: 'high',
    tags: ['work'],
  };

  it('rejects an unauthenticated request', () =>
    request(app.getHttpServer()).get('/tasks').expect(403));

  it('creates a task and returns it with a score', async () => {
    const res = await post(USER_A, validTask).expect(201);
    expect(res.body).toMatchObject({ title: 'Deploy backend', completed: false, priority: 'high' });
    expect(res.body.id).toBeDefined();
    expect(typeof res.body.score).toBe('number');
  });

  it('rejects a deadline that precedes startAt', () =>
    post(USER_A, { ...validTask, deadline: '2026-09-03T08:00:00.000Z' }).expect(400));

  it('rejects an unknown field', () =>
    post(USER_A, { ...validTask, colour: 'red' }).expect(400));

  it('never returns another user’s tasks', async () => {
    await post(USER_A, validTask).expect(201);
    const res = await request(app.getHttpServer())
      .get('/tasks').set('x-test-uid', USER_B).expect(200);
    expect(res.body.data).toHaveLength(0);
  });

  it('returns 404 when fetching another user’s task by id', async () => {
    const created = await post(USER_A, validTask).expect(201);
    await request(app.getHttpServer())
      .get(`/tasks/${created.body.id}`).set('x-test-uid', USER_B).expect(404);
  });

  it('toggles completion and sets completedAt', async () => {
    const created = await post(USER_A, validTask).expect(201);
    const toggled = await request(app.getHttpServer())
      .patch(`/tasks/${created.body.id}/toggle`).set('x-test-uid', USER_A).expect(200);
    expect(toggled.body.completed).toBe(true);
    expect(toggled.body.completedAt).not.toBeNull();

    const untoggled = await request(app.getHttpServer())
      .patch(`/tasks/${created.body.id}/toggle`).set('x-test-uid', USER_A).expect(200);
    expect(untoggled.body.completed).toBe(false);
    expect(untoggled.body.completedAt).toBeNull();
  });

  it('filters by status and priority', async () => {
    await post(USER_A, { ...validTask, title: 'Active high', priority: 'high' }).expect(201);
    const urgent = await post(USER_A, { ...validTask, title: 'Urgent to complete', priority: 'urgent' }).expect(201);
    await post(USER_A, { ...validTask, title: 'Active low', priority: 'low' }).expect(201);
    await request(app.getHttpServer())
      .patch(`/tasks/${urgent.body.id}/toggle`).set('x-test-uid', USER_A).expect(200);

    const active = await request(app.getHttpServer())
      .get('/tasks?status=active').set('x-test-uid', USER_A).expect(200);
    expect(active.body.count).toBe(2);
    expect(active.body.data.every((t: any) => !t.completed)).toBe(true);

    const completed = await request(app.getHttpServer())
      .get('/tasks?status=completed').set('x-test-uid', USER_A).expect(200);
    expect(completed.body.count).toBe(1);
    expect(completed.body.data[0].title).toBe('Urgent to complete');

    const highOnly = await request(app.getHttpServer())
      .get('/tasks?priority=high').set('x-test-uid', USER_A).expect(200);
    expect(highOnly.body.count).toBe(1);
    expect(highOnly.body.data[0].priority).toBe('high');
  });

  it('returns coherent stats', async () => {
    await post(USER_A, { ...validTask, title: 'A', priority: 'low' }).expect(201);
    await post(USER_A, { ...validTask, title: 'B', priority: 'high' }).expect(201);
    const overdue = await post(USER_A, {
      ...validTask,
      title: 'C',
      priority: 'urgent',
      startAt: '2020-01-01T00:00:00.000Z',
      deadline: '2020-01-02T00:00:00.000Z',
    }).expect(201);
    const toComplete = await post(USER_A, { ...validTask, title: 'D', priority: 'medium' }).expect(201);
    await request(app.getHttpServer())
      .patch(`/tasks/${toComplete.body.id}/toggle`).set('x-test-uid', USER_A).expect(200);

    const res = await request(app.getHttpServer())
      .get('/tasks/stats').set('x-test-uid', USER_A).expect(200);

    expect(res.body.total).toBe(4);
    expect(res.body.completed).toBe(1);
    expect(res.body.active).toBe(3);
    expect(res.body.overdue).toBe(1);
    expect(res.body.byPriority).toEqual({ low: 1, medium: 1, high: 1, urgent: 1 });
    expect(res.body.completionRate).toBe(0.25);
    expect(overdue.body.priority).toBe('urgent');
  });

  it('reports completionRate 0 (not NaN) when there are zero tasks', async () => {
    const res = await request(app.getHttpServer())
      .get('/tasks/stats').set('x-test-uid', USER_A).expect(200);
    expect(res.body.total).toBe(0);
    expect(res.body.completionRate).toBe(0);
  });

  it('reports completionRate 1 when every task is completed', async () => {
    const a = await post(USER_A, { ...validTask, title: 'A' }).expect(201);
    const b = await post(USER_A, { ...validTask, title: 'B' }).expect(201);
    await request(app.getHttpServer()).patch(`/tasks/${a.body.id}/toggle`).set('x-test-uid', USER_A).expect(200);
    await request(app.getHttpServer()).patch(`/tasks/${b.body.id}/toggle`).set('x-test-uid', USER_A).expect(200);

    const res = await request(app.getHttpServer())
      .get('/tasks/stats').set('x-test-uid', USER_A).expect(200);
    expect(res.body.total).toBe(2);
    expect(res.body.completed).toBe(2);
    expect(res.body.completionRate).toBe(1);
  });

  describe('sort modes', () => {
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const toggle = (id: string) =>
      request(app.getHttpServer()).patch(`/tasks/${id}/toggle`).set('x-test-uid', USER_A).expect(200);
    const listSortedBy = async (sort: string) =>
      (
        await request(app.getHttpServer())
          .get(`/tasks?sort=${sort}`)
          .set('x-test-uid', USER_A)
          .expect(200)
      ).body.data.map((t: any) => t.id);

    it('sinks completed tasks to the bottom in every mode, and orders "created" newest-first within each group', async () => {
      // Created strictly in order A, B, C, D — small delays guarantee distinct createdAt values.
      const a = await post(USER_A, { ...validTask, title: 'A (active)' }).expect(201);
      await sleep(5);
      const b = await post(USER_A, { ...validTask, title: 'B (active)' }).expect(201);
      await sleep(5);
      const c = await post(USER_A, { ...validTask, title: 'C (completed)' }).expect(201);
      await sleep(5);
      const d = await post(USER_A, { ...validTask, title: 'D (completed)' }).expect(201);

      await toggle(c.body.id);
      await toggle(d.body.id);

      const activeIds = [a.body.id, b.body.id].sort();
      const completedIds = [c.body.id, d.body.id].sort();

      // Every mode must push both completed tasks below both active tasks.
      for (const sort of ['smart', 'deadline', 'priority', 'created']) {
        const ids = await listSortedBy(sort);
        expect(ids.slice(0, 2).sort()).toEqual(activeIds);
        expect(ids.slice(2).sort()).toEqual(completedIds);
      }

      // "created" additionally orders each group newest-createdAt-first: B before A, D before C.
      const createdOrder = await listSortedBy('created');
      expect(createdOrder).toEqual([b.body.id, a.body.id, d.body.id, c.body.id]);
    });
  });
});
