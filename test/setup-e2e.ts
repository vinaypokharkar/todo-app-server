import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongo: MongoMemoryServer;

export async function startInMemoryMongo(): Promise<string> {
  mongo = await MongoMemoryServer.create();
  return mongo.getUri();
}

export async function stopInMemoryMongo(): Promise<void> {
  await mongoose.disconnect();
  await mongo?.stop();
}

export async function clearCollections(): Promise<void> {
  // @nestjs/mongoose opens its connection via mongoose.createConnection(),
  // not mongoose.connect() — so the app's connection lives in
  // mongoose.connections, not the mongoose.connection singleton. Clear
  // every open connection's collections to actually hit the right one.
  const openConnections = mongoose.connections.filter((c) => c.readyState === 1);
  await Promise.all(
    openConnections.flatMap((conn) =>
      Object.values(conn.collections).map((c) => c.deleteMany({})),
    ),
  );
}
