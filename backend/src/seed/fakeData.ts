// Deterministic fake professors, so every environment gets the same data.

interface College { name: string; domain: string }
interface Dept { name: string; code: string; keywords: string[] }

const COLLEGES: College[] = [
  { name: 'IIT Delhi', domain: 'iitd.ac.in' },
  { name: 'IIT Bombay', domain: 'iitb.ac.in' },
  { name: 'IIT Madras', domain: 'iitm.ac.in' },
  { name: 'IIT Kanpur', domain: 'iitk.ac.in' },
  { name: 'IIT Kharagpur', domain: 'iitkgp.ac.in' },
  { name: 'IIT Roorkee', domain: 'iitr.ac.in' },
  { name: 'IISc Bengaluru', domain: 'iisc.ac.in' },
  { name: 'NIT Trichy', domain: 'nitt.edu' },
  { name: 'BITS Pilani', domain: 'pilani.bits-pilani.ac.in' },
];

const DEPARTMENTS: Dept[] = [
  { name: 'Computer Science', code: 'cse', keywords: ['Machine Learning', 'Systems', 'Algorithms'] },
  { name: 'Physics', code: 'phy', keywords: ['Quantum Computing', 'Optics', 'Condensed Matter'] },
  { name: 'Biological Sciences', code: 'biol', keywords: ['Neuroscience', 'Genomics', 'Cell Biology'] },
  { name: 'Mechanical Engineering', code: 'mech', keywords: ['Robotics', 'Thermodynamics', 'Fluid Dynamics'] },
  { name: 'Electrical Engineering', code: 'ee', keywords: ['Machine Learning', 'Signal Processing', 'VLSI'] },
  { name: 'Chemistry', code: 'chem', keywords: ['Material Science', 'Catalysis', 'Polymers'] },
  { name: 'Mathematics', code: 'math', keywords: ['Number Theory', 'Optimization', 'Quantum Computing'] },
  { name: 'Metallurgical & Materials Engineering', code: 'mme', keywords: ['Material Science', 'Alloys', 'Nanomaterials'] },
  { name: 'Civil Engineering', code: 'civil', keywords: ['Structures', 'Geotechnics', 'Transportation'] },
];

const DESIGNATIONS = ['Professor', 'Associate Professor', 'Assistant Professor'];

const FIRST = ['Ananya', 'Rohan', 'Priya', 'Arjun', 'Venkata', 'Meera', 'Sanjay', 'Kavita', 'Rahul', 'Deepa', 'Vikram', 'Lakshmi', 'Amit', 'Nandini', 'Suresh', 'Isha', 'Karthik', 'Shreya', 'Manoj', 'Pooja'];
const LAST = ['Sharma', 'Mehta', 'Nair', 'Rao', 'Subramanian', 'Iyer', 'Gupta', 'Banerjee', 'Reddy', 'Kulkarni', 'Verma', 'Menon', 'Chatterjee', 'Joshi', 'Pillai', 'Desai', 'Singh', 'Bhat', 'Mukherjee', 'Kapoor'];

export interface SeedProfessor {
  id: string;
  name: string;
  profileUrl: string;
  college: string;
  department: string;
  designation: string;
  emails: string[];
  keywords: string[];
}

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateProfessors(count: number): SeedProfessor[] {
  const rand = mulberry32(42);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)] as T;
  const out: SeedProfessor[] = [];

  for (let i = 0; i < count; i++) {
    const first = pick(FIRST);
    const last = pick(LAST);
    const college = pick(COLLEGES);
    const dept = pick(DEPARTMENTS);
    const slug = `${first}.${last}`.toLowerCase();

    const emails = [`${first[0]!.toLowerCase()}${last.toLowerCase()}@${dept.code}.${college.domain}`];
    const extra = Math.floor(rand() * 3);
    if (extra >= 1) emails.push(`${slug}@${college.domain}`);
    if (extra >= 2) emails.push(`${slug}.${dept.code}@gmail.com`);

    out.push({
      id: `prof_${i + 1}`,
      name: `Dr. ${first} ${last}`,
      profileUrl: `https://${dept.code}.${college.domain}/faculty/${slug}`,
      college: college.name,
      department: dept.name,
      designation: pick(DESIGNATIONS),
      emails,
      keywords: dept.keywords,
    });
  }
  return out;
}
