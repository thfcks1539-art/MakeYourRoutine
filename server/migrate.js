// TURSO_DATABASE_URL / TURSO_AUTH_TOKEN 환경변수를 설정한 뒤 실행하면
// 해당 Turso DB에 server/migrations/001_init.sql 스키마를 적용합니다.
const db = require('./db');

db.init()
  .then(() => {
    console.log('마이그레이션 완료!');
    process.exit(0);
  })
  .catch(err => {
    console.error('마이그레이션 실패:', err);
    process.exit(1);
  });
