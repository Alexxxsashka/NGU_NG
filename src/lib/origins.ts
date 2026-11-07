import 'server-only';

export function trustedOrigins(appUrl: string) {
  const origin = new URL(appUrl).origin;
  // Both domains route to the NGU production project.
  const productionOrigins = ['https://ngung.org', 'https://ngu-ng-alexxxsashkas-projects.vercel.app'];
  return productionOrigins.includes(origin) ? productionOrigins : [origin];
}
