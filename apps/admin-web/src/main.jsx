import { StrictMode, useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
const SESSION_KEY = "icare-admin-session";
const SESSION_EXPIRED_EVENT = "icare-admin-session-expired";

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Staff JWTs expire after 8h. Any 401 from an authenticated admin request means
// the session is stale - clear it and let the App-level listener bounce back to
// the login screen instead of leaving the user staring at a raw error string.
function handleUnauthorized() {
  localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

function AppShellHeader({ email }) {
  return (
    <div className="brand">
      <div className="mark" aria-hidden="true">
        I
      </div>
      <div>
        <h1>ICare</h1>
        <p>Admin console{email ? ` · ${email}` : ""}</p>
      </div>
    </div>
  );
}

function LoginScreen({ onLogin, sessionExpired }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/auth/staff/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "admin", email, password })
      });
      if (!response.ok) {
        setError("Invalid admin email or password.");
        return;
      }
      const session = await response.json();
      onLogin(session);
    } catch {
      setError(`Cannot reach the backend at ${API_BASE}.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="brand">
          <div className="mark" aria-hidden="true">
            I
          </div>
          <div>
            <h1>ICare</h1>
            <p>Admin Login</p>
          </div>
        </div>
        {sessionExpired ? (
          <p className="field-error" role="alert">
            Your session expired. Please log in again.
          </p>
        ) : null}
        <form onSubmit={submit} noValidate>
          <label htmlFor="email">
            Email address
            <input id="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label htmlFor="password">
            Password
            <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error ? (
            <p className="field-error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="primary" type="submit" disabled={busy} style={{ width: "100%" }}>
            {busy ? "Signing in..." : "Login"}
          </button>
          <p className="login-note">Use your admin account to sign in.</p>
        </form>
      </div>
    </div>
  );
}

function useAdminFetch(session, path, { skip } = {}) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((value) => value + 1), []);

  useEffect(() => {
    if (skip || !session) return;
    let cancelled = false;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${session.token}` } })
      .then(async (response) => {
        if (response.status === 401) {
          handleUnauthorized();
          throw new Error("Your session expired. Please log in again.");
        }
        if (!response.ok) throw new Error(`Request failed (${response.status})`);
        return response.json();
      })
      .then((data) => {
        if (!cancelled) setState({ loading: false, error: null, data });
      })
      .catch((error) => {
        if (!cancelled) setState({ loading: false, error: error.message, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [session, path, skip, reloadToken]);

  return { ...state, reload };
}

async function adminDelete(session, path) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${session.token}` }
  });
  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("Your session expired. Please log in again.");
  }
  if (!response.ok) throw new Error(`Delete failed (${response.status})`);
  return response.json();
}

function OverviewPanel({ session }) {
  const { loading, error, data } = useAdminFetch(session, "/admin/overview");
  if (loading) return <p>Loading overview...</p>;
  if (error) return <p className="field-error">{error}</p>;
  const statusEntries = Object.entries(data.screeningsByStatus ?? {});
  return (
    <>
      <div className="stat-grid">
        <div className="stat-card">
          <span>Patients</span>
          <strong>{data.patients}</strong>
        </div>
        <div className="stat-card">
          <span>Screenings</span>
          <strong>{data.screenings}</strong>
        </div>
        <div className="stat-card">
          <span>Reviewed</span>
          <strong>{data.reviewedScreenings}</strong>
        </div>
        {statusEntries.map(([status, count]) => (
          <div className="stat-card" key={status}>
            <span>{status}</span>
            <strong>{count}</strong>
          </div>
        ))}
      </div>
      <div className="panel">
        <h3>About this console</h3>
        <p>
          Manage patient records, screenings, the system activity log, active doctor consent grants, and configured staff
          accounts. Deletes here are permanent for this local-first data store.
        </p>
      </div>
    </>
  );
}

function PatientsPanel({ session }) {
  const { loading, error, data, reload } = useAdminFetch(session, "/admin/patients");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState(null);

  const patients = useMemo(() => {
    const list = data?.patients ?? [];
    const term = query.trim().toLowerCase();
    if (!term) return list;
    return list.filter((patient) => `${patient.fullName} ${patient.patientId} ${patient.phone}`.toLowerCase().includes(term));
  }, [data, query]);

  async function remove(patientId) {
    if (!window.confirm(`Delete patient ${patientId} and all of their screenings? This cannot be undone.`)) return;
    setBusyId(patientId);
    try {
      await adminDelete(session, `/admin/patients/${encodeURIComponent(patientId)}`);
      reload();
    } catch (deleteError) {
      window.alert(deleteError.message);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p>Loading patients...</p>;
  if (error) return <p className="field-error">{error}</p>;

  return (
    <div className="panel">
      <div className="search-row">
        <input placeholder="Search name, patient ID, or phone" value={query} onChange={(event) => setQuery(event.target.value)} />
        <button onClick={reload}>Refresh</button>
      </div>
      {patients.length ? (
        <table>
          <thead>
            <tr>
              <th>Patient ID</th>
              <th>Name</th>
              <th>Phone</th>
              <th>Date of birth</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {patients.map((patient) => (
              <tr key={patient.patientId}>
                <td>{patient.patientId}</td>
                <td>{patient.fullName}</td>
                <td>{patient.phone}</td>
                <td>{patient.dateOfBirth ?? "-"}</td>
                <td>{new Date(patient.createdAt).toLocaleString()}</td>
                <td className="row-actions">
                  <button className="danger" disabled={busyId === patient.patientId} onClick={() => remove(patient.patientId)}>
                    {busyId === patient.patientId ? "Deleting..." : "Delete"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="empty-state">No patients match.</p>
      )}
    </div>
  );
}

function ScreeningsPanel({ session }) {
  const { loading, error, data, reload } = useAdminFetch(session, "/admin/screenings");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState(null);

  const screenings = useMemo(() => {
    const list = data?.screenings ?? [];
    const term = query.trim().toLowerCase();
    const sorted = [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (!term) return sorted;
    return sorted.filter((screening) => `${screening.id} ${screening.patientId} ${screening.capturedBy}`.toLowerCase().includes(term));
  }, [data, query]);

  async function remove(id) {
    if (!window.confirm(`Delete screening ${id}? This cannot be undone.`)) return;
    setBusyId(id);
    try {
      await adminDelete(session, `/admin/screenings/${encodeURIComponent(id)}`);
      reload();
    } catch (deleteError) {
      window.alert(deleteError.message);
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p>Loading screenings...</p>;
  if (error) return <p className="field-error">{error}</p>;

  return (
    <div className="panel">
      <div className="search-row">
        <input placeholder="Search screening ID, patient ID, or captured by" value={query} onChange={(event) => setQuery(event.target.value)} />
        <button onClick={reload}>Refresh</button>
      </div>
      {screenings.length ? (
        <table>
          <thead>
            <tr>
              <th>Screening ID</th>
              <th>Patient ID</th>
              <th>Captured by</th>
              <th>Status</th>
              <th>AI grade</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {screenings.map((screening) => (
              <tr key={screening.id}>
                <td title={screening.id}>{screening.id.slice(0, 8)}...</td>
                <td>{screening.patientId}</td>
                <td>{screening.capturedBy}</td>
                <td>
                  <span className={`badge ${screening.status}`}>{screening.status}</span>
                </td>
                <td>{screening.result?.classification?.primary?.predictedGrade ?? "-"}</td>
                <td>{new Date(screening.createdAt).toLocaleString()}</td>
                <td className="row-actions">
                  <button className="danger" disabled={busyId === screening.id} onClick={() => remove(screening.id)}>
                    {busyId === screening.id ? "Deleting..." : "Delete"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="empty-state">No screenings match.</p>
      )}
    </div>
  );
}

function AuditLogPanel({ session }) {
  const { loading, error, data, reload } = useAdminFetch(session, "/admin/audit");
  const events = data?.events ?? [];
  if (loading) return <p>Loading audit log...</p>;
  if (error) return <p className="field-error">{error}</p>;
  return (
    <div className="panel">
      <div className="search-row">
        <button onClick={reload}>Refresh</button>
      </div>
      {events.length ? (
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Patient ID</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event, index) => (
              <tr key={`${event.createdAt}-${index}`}>
                <td>{new Date(event.createdAt).toLocaleString()}</td>
                <td>{event.actor}</td>
                <td>{event.action}</td>
                <td>{event.patientId ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="empty-state">No activity recorded yet this session.</p>
      )}
    </div>
  );
}

function ConsentGrantsPanel({ session }) {
  const { loading, error, data, reload } = useAdminFetch(session, "/admin/consent-grants");
  const grants = data?.grants ?? [];
  if (loading) return <p>Loading consent grants...</p>;
  if (error) return <p className="field-error">{error}</p>;
  return (
    <div className="panel">
      <div className="search-row">
        <button onClick={reload}>Refresh</button>
      </div>
      {grants.length ? (
        <table>
          <thead>
            <tr>
              <th>Doctor</th>
              <th>Patient ID</th>
              <th>Expires</th>
            </tr>
          </thead>
          <tbody>
            {grants.map((grant, index) => (
              <tr key={`${grant.doctorId}-${grant.patientId}-${index}`}>
                <td>{grant.doctorId}</td>
                <td>{grant.patientId}</td>
                <td>{new Date(grant.expiresAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="empty-state">No active patient-authorized doctor access right now.</p>
      )}
    </div>
  );
}

function StaffPanel({ session }) {
  const { loading, error, data } = useAdminFetch(session, "/admin/staff");
  const staff = data?.staff ?? [];
  if (loading) return <p>Loading staff accounts...</p>;
  if (error) return <p className="field-error">{error}</p>;
  return (
    <div className="panel">
      <table>
        <thead>
          <tr>
            <th>Role</th>
            <th>Email</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {staff.map((account) => (
            <tr key={account.role}>
              <td style={{ textTransform: "capitalize" }}>{account.role}</td>
              <td>{account.email}</td>
              <td>
                <span className={`badge ${account.source}`}>{account.source}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: 14 }}>
        Demo accounts use the shared local password. Set <code>ICARE_&lt;ROLE&gt;_EMAIL</code> and{" "}
        <code>ICARE_&lt;ROLE&gt;_PASSWORD_HASH</code> in the backend&apos;s <code>.env</code> to configure real accounts.
      </p>
    </div>
  );
}

const TABS = [
  { key: "overview", label: "Overview", render: OverviewPanel },
  { key: "patients", label: "Patients", render: PatientsPanel },
  { key: "screenings", label: "Screenings", render: ScreeningsPanel },
  { key: "audit", label: "Activity log", render: AuditLogPanel },
  { key: "consent", label: "Consent grants", render: ConsentGrantsPanel },
  { key: "staff", label: "Staff accounts", render: StaffPanel }
];

function Dashboard({ session, onLogout }) {
  const [tab, setTab] = useState("overview");
  const [apiOnline, setApiOnline] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/health`)
      .then((response) => {
        if (!cancelled) setApiOnline(response.ok);
      })
      .catch(() => {
        if (!cancelled) setApiOnline(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const active = TABS.find((item) => item.key === tab) ?? TABS[0];
  const Panel = active.render;

  return (
    <div className="shell">
      <aside className="sidebar">
        <AppShellHeader email={session.email} />
        <nav aria-label="Admin sections">
          {TABS.map((item) => (
            <button key={item.key} type="button" className={item.key === tab ? "active" : ""} onClick={() => setTab(item.key)}>
              {item.label}
            </button>
          ))}
        </nav>
        <button type="button" className="logout" onClick={onLogout}>
          Log out
        </button>
      </aside>
      <main className="main">
        <div className="topline">
          <div>
            <h2>{active.label}</h2>
          </div>
          <span className={`status-pill ${apiOnline ? "" : "offline"}`}>
            {apiOnline === null ? "Checking system..." : apiOnline ? "System online" : "Backend unreachable"}
          </span>
        </div>
        <Panel session={session} />
      </main>
    </div>
  );
}

function App() {
  const [session, setSession] = useState(loadSession);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    function onExpired() {
      setSession(null);
      setSessionExpired(true);
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  function login(nextSession) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
    setSession(nextSession);
    setSessionExpired(false);
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
  }

  if (!session) return <LoginScreen onLogin={login} sessionExpired={sessionExpired} />;
  return <Dashboard session={session} onLogout={logout} />;
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
