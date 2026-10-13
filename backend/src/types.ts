/** A professor as stored. `profileUrl` is the real link; never sent to logged-out users. */
export interface ProfessorRecord {
  id: string;
  name: string;
  profileUrl: string | null;
  college: string;
  department: string;
  designation: string;
  emailCount: number;
}

/** What the list endpoint returns. Emails are never included; they come from the reveal endpoint. */
export interface PublicProfessor {
  id: string;
  name: string;
  profileUrl: string;
  college: string;
  department: string;
  designation: string;
  emailCount: number;
}

export interface ProfessorQuery {
  q?: string;
  college?: string;
  department?: string;
  designation?: string;
  page: number;
  pageSize: number;
}

export interface ProfessorPage<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface FilterOptions {
  colleges: string[];
  departments: string[];
  designations: string[];
}

export interface Stats {
  professors: number;
  universities: number;
  departments: number;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
}
