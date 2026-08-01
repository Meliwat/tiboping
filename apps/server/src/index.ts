export const serviceName = 'TiboPing';

if (process.env['NODE_ENV'] !== 'test') {
  process.stdout.write(`${serviceName} server scaffold is ready.\n`);
}
