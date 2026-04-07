import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { DocumentPage } from './pages/DocumentPage';
import { ProductInfoPage } from './pages/ProductInfoPage';

function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
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
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/')}>
            ← Inicio
          </button>
        )}
      </div>
    </nav>
  );
}

function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="bottom-nav">
      <button
        className={`bottom-nav-item${location.pathname === '/' ? ' active' : ''}`}
        onClick={() => navigate('/')}
      >
        <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
          <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V9.5z"/>
          <path d="M9 21V12h6v9"/>
        </svg>
        Inicio
      </button>

      <button
        className="bottom-nav-item"
        onClick={() => {
          navigate('/');
          setTimeout(() => {
            document.getElementById('upload-trigger')?.click();
          }, 100);
        }}
      >
        <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
          <rect x="3" y="3" width="18" height="18" rx="3"/>
          <path d="M12 8v8M8 12h8"/>
        </svg>
        Subir
      </button>
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
      <BottomNav />
    </BrowserRouter>
  );
}
