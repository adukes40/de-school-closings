import React, { useEffect, useState, useRef } from 'react';
import SchoolClosingsMap from './components/SchoolClosingsMap';
import 'leaflet/dist/leaflet.css';
import './App.css';

const POLL_INTERVAL = 3 * 60 * 1000; // re-fetch every 3 minutes

function App() {
  const [closings, setClosings] = useState([]);
  const [closingsByDistrict, setClosingsByDistrict] = useState({});
  const [districts, setDistricts] = useState(null);
  const [fetchedAt, setFetchedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const districtsLoadedRef = useRef(false);

  useEffect(() => {
    async function loadData() {
      try {
        const needsDistricts = !districtsLoadedRef.current;
        const requests = [fetch('/api/closings')];
        if (needsDistricts) requests.push(fetch('/api/districts'));

        const [closingsRes, districtsRes] = await Promise.all(requests);

        if (!closingsRes.ok) throw new Error(`API error: ${closingsRes.status}`);
        const closingsData = await closingsRes.json();
        setClosings(closingsData.closings);
        setClosingsByDistrict(closingsData.byDistrict);
        setFetchedAt(closingsData.fetchedAt);

        if (districtsRes) {
          if (!districtsRes.ok) throw new Error(`Districts API error: ${districtsRes.status}`);
          setDistricts(await districtsRes.json());
          districtsLoadedRef.current = true;
        }

        setLoading(false);
        setError(null);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    }

    loadData();
    const id = setInterval(loadData, POLL_INTERVAL);
    return () => clearInterval(id);
  }, []);

  if (loading) {
    return <div className="loading-screen">Loading closings data...</div>;
  }

  if (error) {
    return (
      <div className="error-screen">
        <h2>Error</h2>
        <p>{error}</p>
        <p>Make sure the API server is running: <code>npm run server</code></p>
      </div>
    );
  }

  const closedCount = closings.filter(c => c.statusType === 'closed').length;
  const delayCount  = closings.filter(c => c.statusType === 'delay').length;
  const earlyCount  = closings.filter(c => c.statusType === 'early dismissal').length;

  return (
    <div className="app">
      <header className="header">
        <h1 className="header-title">Delaware School Closings</h1>
        <div className="header-right">
          <div className="header-badges">
            {closedCount > 0 && <span className="badge badge-closed">{closedCount} Closed</span>}
            {delayCount  > 0 && <span className="badge badge-delay">{delayCount} Delayed</span>}
            {earlyCount  > 0 && <span className="badge badge-early">{earlyCount} Early Dismissal</span>}
            {closings.length === 0 && <span className="badge badge-open">All Open</span>}
          </div>
          {fetchedAt && (
            <span className="last-updated">
              Updated {new Date(fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </header>

      <div className="map-container">
        {closings.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#8b949e' }}>
            <h2 style={{ color: '#e6edf3' }}>No closings reported</h2>
            <p>There are currently no school closings or delays in Delaware.</p>
          </div>
        ) : (
          <SchoolClosingsMap districts={districts} closingsByDistrict={closingsByDistrict} />
        )}

        <div className="legend">
          <div className="legend-item"><span className="legend-swatch" style={{ background: '#ef4444' }} />Closed</div>
          <div className="legend-item"><span className="legend-swatch" style={{ background: '#f59e0b' }} />Delay</div>
          <div className="legend-item"><span className="legend-swatch" style={{ background: '#f97316' }} />Early Dismissal</div>
          <div className="legend-item"><span className="legend-swatch" style={{ background: '#30363d', border: '1px solid #484f58' }} />Open</div>
        </div>
      </div>
    </div>
  );
}

export default App;
