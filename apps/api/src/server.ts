import { buildApp } from './app';
import { Store } from './db';
import { fileURLToPath } from 'node:url';

const port = Number(process.env.PORT ?? 3001);
const file = process.env.DB_FILE ?? 'cricketpro.sqlite';
// AUTH=off disables login (every caller is an admin). Only for a trusted local network.
const auth = process.env.AUTH !== 'off';
const app = buildApp({ store: new Store(file), auth, secret: process.env.JWT_SECRET, webDir: process.env.WEB_DIR ?? fileURLToPath(new URL('../../web/dist', import.meta.url)), logger: true });

app.listen({ port, host: process.env.HOST ?? '0.0.0.0' }).catch((e) => { app.log.error(e); process.exit(1); });
if (!auth) app.log.warn('AUTH=off: anyone who can reach this port can read and change all data');
