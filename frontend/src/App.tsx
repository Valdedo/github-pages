import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { DocumentPage } from './pages/DocumentPage';
import { ProductInfoPage } from './pages/ProductInfoPage';

function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <nav className="navbar">
      <a href="/" className="navbar-brand">
        <div className="navbar-brand-icon">CF</div>
        <span>Casa Fonso</span>
        <span style={{ fontWeight: 400, color: 'var(--text-3)', fontSize: '13px', paddingLeft: '2px' }}>
          · Albaranes
        </span>
      </a>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
        {!isHome && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate('/')}
          >
            ← Inicio
          </button>
        )}
        <span style={{
          fontSize: '11px',
          color: 'var(--text-3)',
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: '99px',
          padding: '2px 10px',
          fontWeight: 500,
        }}>
          v1.0
        </span>
      </div>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <main style={{ minHeight: 'calc(100vh - 56px)' }}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/documento/:id" element={<DocumentPage />} />
          <Route path="/producto/:id" element={<ProductInfoPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
