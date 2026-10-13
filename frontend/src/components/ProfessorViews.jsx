import { ArrowUpRight, BuildingIcon } from './icons.jsx';
import EmailList from './EmailList.jsx';

function NameLink({ professor }) {
  if (!professor.profileUrl) return <span className="prof-name">{professor.name}</span>;
  return (
    <a className="prof-name" href={professor.profileUrl} target="_blank" rel="noopener noreferrer">
      {professor.name}
      <ArrowUpRight width={16} height={16} />
    </a>
  );
}

/** Desktop and tablet: a real table. */
export function ProfessorTable({ rows }) {
  return (
    <div className="table-wrap">
      <table className="prof-table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">College</th>
            <th scope="col">Department</th>
            <th scope="col">Designation</th>
            <th scope="col">Email contact</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td><NameLink professor={p} /></td>
              <td><span className="college-pill">{p.college}</span></td>
              <td>{p.department}</td>
              <td>{p.designation}</td>
              <td><EmailList professor={p} variant="chip" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Mobile: one card per professor. */
export function ProfessorCards({ rows }) {
  return (
    <ul className="prof-cards">
      {rows.map((p) => (
        <li key={p.id} className="prof-card">
          <NameLink professor={p} />
          <p className="prof-designation">{p.designation}</p>
          <p className="prof-dept">{p.department}</p>
          <span className="college-tag">
            <BuildingIcon width={15} height={15} /> {p.college}
          </span>
          <EmailList professor={p} variant="box" />
        </li>
      ))}
    </ul>
  );
}

export function SkeletonRows({ count = 6 }) {
  return (
    <div className="skeleton" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton-row">
          <span style={{ width: '22%' }} />
          <span style={{ width: '12%' }} />
          <span style={{ width: '18%' }} />
          <span style={{ width: '14%' }} />
          <span style={{ width: '24%' }} />
        </div>
      ))}
    </div>
  );
}
