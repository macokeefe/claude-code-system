import { Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import SkuList from './pages/SkuList.jsx';
import SkuDetail from './pages/SkuDetail.jsx';
import Tags from './pages/Tags.jsx';
import ImportPage from './pages/ImportPage.jsx';

export default function App() {
  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="brand">Standard Work<small>Labor time tracking</small></div>
        <NavLink to="/" end>Dashboard</NavLink>
        <NavLink to="/skus">SKUs</NavLink>
        <NavLink to="/tags">Shared Steps</NavLink>
        <NavLink to="/import">Import</NavLink>
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
