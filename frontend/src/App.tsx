import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { DocumentPage } from './pages/DocumentPage';
import { ProductInfoPage } from './pages/ProductInfoPage';

function Navbar() {
  return (
    <nav className="navbar">
      <a href="/" className="navbar-brand">
        <div className="navbar-brand-icon">📦</div>
        Gestor de Albaranes
      </a>
      <span className="navbar-subtitle">Ferretería &amp; Materiales</span>
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
