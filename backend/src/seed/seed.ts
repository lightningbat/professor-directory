import type { Db } from '../db.js';
import { generateProfessors } from './fakeData.js';

/** Replaces all rows with fresh fake data. Returns how many professors were inserted. */
export function seedAll(db: Db, count: number): number {
  const professors = generateProfessors(count);

  const insertProfessor = db.prepare(
    `INSERT INTO professors (id, name, profile_url, college, department, designation, keywords)
     VALUES (@id, @name, @profileUrl, @college, @department, @designation, @keywords)`,
  );
  const insertEmail = db.prepare(
    'INSERT INTO professor_emails (professor_id, email, position) VALUES (?, ?, ?)',
  );

  db.transaction(() => {
    db.exec('DELETE FROM professor_emails; DELETE FROM professors;');
    for (const p of professors) {
      insertProfessor.run({ ...p, keywords: p.keywords.join(' ') });
      p.emails.forEach((email, position) => insertEmail.run(p.id, email, position));
    }
  })();

  return professors.length;
}

/** Only seeds when the table is empty, so real data is never overwritten. */
export function seedIfEmpty(db: Db, count: number): number {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM professors').get() as { n: number };
  return n === 0 ? seedAll(db, count) : 0;
}
