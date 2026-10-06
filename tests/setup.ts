// Segredos sintéticos, nunca usados fora dos testes unitários.
process.env.AUTH_SECRET = 'unit-tests-only-auth-key-abcdefghijklmnopqrstuvwxyz0123456789';
process.env.CRON_SECRET = 'unit-tests-only-cron-key-abcdefghijklmnopqrstuvwxyz9876543210';
process.env.ENCRYPTION_KEY = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');
process.env.APP_URL = 'http://localhost:3147';
process.env.DATABASE_URL = 'postgresql://unit:unit@127.0.0.1:1/unit_tests';
process.env.STORAGE_DRIVER = 'local';
