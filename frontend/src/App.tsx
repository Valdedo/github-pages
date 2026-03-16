import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { DocumentPage } from './pages/DocumentPage';
import { ProductInfoPage } from './pages/ProductInfoPage';

function Navbar() {
  return (
    <nav style={{
      background: '#1F4E79',
      color: '#fff',
      padding: '12px 24px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    }}>
      <a href="/" style={{ color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: '18px' }}>
        📦 Procesador de Albaranes
      </a>
      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', marginLeft: 'auto' }}>
        Ferretería &amp; Materiales
      </span>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <main style={{ minHeight: 'calc(100vh - 52px)' }}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/documento/:id" element={<DocumentPage />} />
          <Route path="/producto/:id" element={<ProductInfoPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
