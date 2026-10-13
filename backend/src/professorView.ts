import type { ProfessorRecord, PublicProfessor } from './types.js';

export function googleSearchUrl(p: Pick<ProfessorRecord, 'name' | 'college' | 'department'>): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`${p.name} ${p.college} ${p.department}`)}`;
}

/** Logged-out visitors get a plain Google search; logged-in users get the direct profile link. */
export function toPublic(p: ProfessorRecord, loggedIn: boolean): PublicProfessor {
  return {
    id: p.id,
    name: p.name,
    profileUrl: loggedIn && p.profileUrl ? p.profileUrl : googleSearchUrl(p),
    college: p.college,
    department: p.department,
    designation: p.designation,
    emailCount: p.emailCount,
  };
}
