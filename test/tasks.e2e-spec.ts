import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { MongooseModule } from '@nestjs/mongoose';
import { FirebaseModule } from '../src/firebase/firebase.module';
import { TasksModule } from '../src/tasks/tasks.module';
import { FirebaseAuthGuard } from '../src/auth/guards/firebase-auth.guard';
import { FirebaseService } from '../src/firebase/firebase.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { startInMemoryMongo, stopInMemoryMongo, clearCollections } from './setup-e2e';

const USER_A = 'uid-alice';
const USER_B = 'uid-bob';

/** Stub guard: reads the uid straight from the header, no Firebase involved. */
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
      imports: [MongooseModule.forRoot(uri), FirebaseModule, TasksModule],
    })
      .overrideGuard(FirebaseAuthGuard)
      .useClass(StubAuthGuard)
      // FirebaseService needs real credentials to init; the stub guard never
      // calls it, but it is still a constructor dependency of the (replaced)
      // FirebaseAuthGuard provider, so give it a harmless stand-in.
      .overrideProvider(FirebaseService)
      .useValue({ auth: {} })
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
});
