import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../src/auth/auth.module';
import { FirebaseAuthGuard } from '../src/auth/guards/firebase-auth.guard';
import { FirebaseModule } from '../src/firebase/firebase.module';
import { FirebaseService } from '../src/firebase/firebase.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { startInMemoryMongo, stopInMemoryMongo, clearCollections } from './setup-e2e';

const USER_A = 'uid-alice';

/** Stub guard: reads the uid straight from the header, no Firebase involved. */
class StubAuthGuard {
  canActivate(ctx: any): boolean {
    const req = ctx.switchToHttp().getRequest();
    const uid = req.headers['x-test-uid'];
    if (!uid) return false;
    req.user = { uid, email: `${uid}@test.dev`, displayName: 'Alice', photoURL: null };
    return true;
  }
}

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const uri = await startInMemoryMongo();
    const moduleRef = await Test.createTestingModule({
      imports: [MongooseModule.forRoot(uri), FirebaseModule, AuthModule],
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

  it('rejects an unauthenticated request', () =>
    request(app.getHttpServer()).get('/auth/me').expect(403));

  it('returns 404 from /auth/me before any sync has happened', () =>
    request(app.getHttpServer()).get('/auth/me').set('x-test-uid', USER_A).expect(404));

  it('upserts the profile on /auth/sync and is idempotent', async () => {
    const first = await request(app.getHttpServer())
      .post('/auth/sync').set('x-test-uid', USER_A).expect(200);
    expect(first.body).toMatchObject({ uid: USER_A, email: `${USER_A}@test.dev`, displayName: 'Alice' });
    expect(first.body.createdAt).toBeDefined();

    const second = await request(app.getHttpServer())
      .post('/auth/sync').set('x-test-uid', USER_A).expect(200);
    expect(second.body.uid).toBe(USER_A);

    const me = await request(app.getHttpServer())
      .get('/auth/me').set('x-test-uid', USER_A).expect(200);
    expect(me.body.uid).toBe(USER_A);
  });
});
