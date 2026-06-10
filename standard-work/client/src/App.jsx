import { useRef } from 'react';
import { Routes, Route, NavLink } from 'react-router-dom';
import { isLocal, backupData, restoreData } from '@backend';
import Dashboard from './pages/Dashboard.jsx';
import SkuList from './pages/SkuList.jsx';
import SkuDetail from './pages/SkuDetail.jsx';
import Tags from './pages/Tags.jsx';
import ImportPage from './pages/ImportPage.jsx';

export default function App() {
  const restoreInput = useRef();

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="brand">Standard Work<small>Labor time tracking</small></div>
        <NavLink to="/" end>Dashboard</NavLink>
        <NavLink to="/skus">SKUs</NavLink>
        <NavLink to="/tags">Shared Steps</NavLink>
        <NavLink to="/import">Import</NavLink>
        {isLocal && (
          <div style={{ position: 'absolute', bottom: 20, left: 12, right: 12 }}>
            <div style={{ fontSize: 11, color: '#7d8aa0', padding: '0 12px 8px' }}>
              Data is saved in this browser. Back up regularly.
            </div>
            <a href="#backup" onClick={e => { e.preventDefault(); backupData(); }}>⬇ Backup data</a>
            <a href="#restore" onClick={e => { e.preventDefault(); restoreInput.current.click(); }}>⬆ Restore backup</a>
            <input type="file" accept=".json" hidden ref={restoreInput}
              onChange={e => {
                const file = e.target.files[0];
                if (!file) return;
                if (window.confirm('Restoring replaces ALL current data with the backup. Continue?')) {
                  restoreData(file).catch(err => alert(err.message));
                }
                e.target.value = '';
              }} />
          </div>
        )}
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/skus" element={<SkuList />} />
          <Route path="/skus/:id" element={<SkuDetail />} />
          <Route path="/tags" element={<Tags />} />
          <Route path="/import" element={<ImportPage />} />
        </Routes>
      </main>
    </div>
  );
}
