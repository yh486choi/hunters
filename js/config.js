const localDemo = ['localhost','127.0.0.1'].includes(location.hostname) && location.port === '8765';
export const DEMO_MODE = localDemo;
export const READ_API_BASE = localDemo
  ? `${location.origin}/api`
  : 'https://us-central1-hunters-2026.cloudfunctions.net';
// Production writes use the deployed V2 functions after deployment and auth checks.
export const WRITE_API_BASE = localDemo ? `${location.origin}/api` : 'https://us-central1-hunters-2026.cloudfunctions.net';




