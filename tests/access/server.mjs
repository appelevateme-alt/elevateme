import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { database, seed } from './database.mjs';
const db = await database(); await seed(db);
const server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 55432 });
await server.start(); console.log('Isolated PostgreSQL protocol test database ready at localhost:55432');
process.on('SIGTERM', async () => { await server.stop(); await db.close(); process.exit(); });
