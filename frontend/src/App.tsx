import { BrowserRouter, Routes, Route, NavLink, Link, Navigate, useNavigate, useLocation, useNavigationType } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard, FileText, Wrench, ShoppingCart,
  BarChart2, Store, ChevronLeft, Menu, BookOpen, Search, Tag, MoreHorizontal, PenLine, CalendarDays
} from 'lucide-react';

import { DashboardPage } from './pages/DashboardPage';
import { HomePage } from './pages/HomePage';
import { DocumentPage } from './pages/DocumentPage';
import { ProductInfoPage } from './pages/ProductInfoPage';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { SalePage } from './pages/SalePage';
import { RepairsPage } from './pages/RepairsPage';
import { OrdersPage } from './pages/OrdersPage';
import { OrderDetailPage } from './pages/OrderDetailPage';
import { CatalogPage } from './pages/CatalogPage';
import { PriceLookupPage } from './pages/PriceLookupPage';
import { CustomLabelsPage } from './pages/CustomLabelsPage';
import { RepairDetailPage } from './pages/RepairDetailPage';
import { FirmasPage } from './pages/FirmasPage';
import { FirmaDetailPage } from './pages/FirmaDetailPage';
import { RepartoPage } from './pages/RepartoPage';
import { TurnosPage } from './pages/TurnosPage';
import { isReparto } from './reparto';
import { Logo } from './components/Logo';
import { AccessGate } from './components/AccessGate';
import { CodigosModal } from './components/CodigosModal';
import { MiCodigoModal } from './components/MiCodigoModal';
import { AvisosLink } from './components/AvisosCard';
import { arrancarCola } from './lib/offline';
import { getRol, cerrarSesion, sesionPersonal } from './auth';
import { getDashboardStats, getFirmasStats, getCorreo } from './api/client';

interface NavBadge {
  repairs: number;
  orders: number;
  firmas: number;
  correo: number;
}

// Menú agrupado por áreas del negocio (igual para la tienda y el encargado)
type NavItem = { to: string; label: string; short?: string; icon: typeof FileText; badge?: keyof NavBadge; exact?: boolean };
const navGroups: { titulo: string; items: NavItem[] }[] = [
  { titulo: 'Clientes', items: [
    { to: '/firmas', label: 'Firmar albaranes', short: 'Firmas', icon: PenLine, badge: 'firmas' },
    { to: '/pedidos', label: 'Pedidos', icon: ShoppingCart, badge: 'orders' },
    { to: '/reparaciones', label: 'Reparaciones', icon: Wrench, badge: 'repairs' },
  ] },
  { titulo: 'Mostrador', items: [
    { to: '/consulta', label: 'Consultar precio', short: 'Precios', icon: Search },
    { to: '/venta', label: 'Venta', icon: Store },
    { to: '/etiquetas', label: 'Etiquetas', icon: Tag },
  ] },
  { titulo: 'Proveedores', items: [
    { to: '/albaranes', label: 'Albaranes de proveedor', short: 'Proveedor', icon: FileText },
    { to: '/catalogo', label: 'Catálogo', icon: BookOpen },
    { to: '/analisis', label: 'Análisis de compras', icon: BarChart2 },
  ] },
  { titulo: 'Equipo', items: [
    { to: '/turnos', label: 'Turnos', icon: CalendarDays },
  ] },
];
const navItems = navGroups.flatMap(g => g.items);
const INICIO: NavItem = { to: '/', label: 'Inicio', icon: LayoutDashboard, exact: true, badge: 'correo' };
// Móvil: lo más usado abajo; el resto, en «Más» por grupos
const BOTTOM = ['/firmas', '/consulta', '/turnos'];
const bottomItems = [INICIO, ...BOTTOM.map(t => navItems.find(n => n.to === t)!)];
const drawerGroups = navGroups.map(g => ({ ...g, items: g.items.filter(n => !BOTTOM.includes(n.to)) })).filter(g => g.items.length);
const drawerItems = drawerGroups.flatMap(g => g.items);

function SidebarNavGroup({ items, badges, collapsed }: {
  items: typeof navItems;
  badges: NavBadge;
  collapsed: boolean;
}) {
  return (
    <>
      {items.map(({ to, label, icon: Icon, badge, exact }) => {
        const count = badge ? badges[badge as keyof NavBadge] : 0;
        return (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}
            title={collapsed ? label : undefined}
          >
            <span className="sidebar-item-icon">
              <Icon size={20} />
              {collapsed && count > 0 && <span className="sidebar-badge">{count > 99 ? '99+' : count}</span>}
            </span>
            {!collapsed && <span className="sidebar-item-label">{label}</span>}
            {!collapsed && count > 0 && <span className="sidebar-badge">{count > 99 ? '99+' : count}</span>}
          </NavLink>
        );
      })}
    </>
  );
}

function SesionLinks() {
  const [codigos, setCodigos] = useState(false);
  const [mio, setMio] = useState(false);
  return (
    <div className="sesion-links">
      <AvisosLink />
      {sesionPersonal() && <button onClick={() => setMio(true)}>Mi código</button>}
      {getRol() === 'admin' && <button onClick={() => setCodigos(true)}>Códigos</button>}
      <button onClick={() => { if (window.confirm('¿Cerrar la sesión en este dispositivo? Habrá que volver a escribir el código.')) { cerrarSesion(); window.location.href = '/'; } }}>Cerrar sesión</button>
      {codigos && <CodigosModal onClose={() => setCodigos(false)} />}
      {mio && <MiCodigoModal onClose={() => setMio(false)} />}
    </div>
  );
}

function Sidebar({ badges, collapsed, onToggle }: { badges: NavBadge; collapsed: boolean; onToggle: () => void }) {
  return (
    <aside className={`sidebar${collapsed ? ' sidebar-collapsed' : ''}`}>
      {/* Logo — also acts as Home link */}
      <div className="sidebar-logo">
        <NavLink to="/" end style={{ textDecoration: 'none', color: 'inherit', display: 'flex' }} aria-label="Inicio">
          <Logo compact={collapsed} size={collapsed ? 32 : 30} />
        </NavLink>
        {!collapsed && (
          <button className="sidebar-collapse-btn" onClick={onToggle} title="Hacer el menú más estrecho" aria-label="Hacer el menú más estrecho">
            <ChevronLeft size={18} />
          </button>
        )}
      </div>

      <nav className="sidebar-nav">
        <SidebarNavGroup items={[INICIO]} badges={badges} collapsed={collapsed} />
      </nav>
      {navGroups.map(g => (
        <nav key={g.titulo} className="sidebar-nav sidebar-nav-grupo" aria-label={g.titulo}>
          {!collapsed && <div className="sidebar-section-label">{g.titulo}</div>}
          <SidebarNavGroup items={g.items} badges={badges} collapsed={collapsed} />
        </nav>
      ))}
      {collapsed ? (
        <button className="sidebar-collapse-btn" style={{ margin: '8px auto 16px' }} onClick={onToggle} title="Ampliar el menú" aria-label="Ampliar el menú">
          <Menu size={18} />
        </button>
      ) : (
        <>
          <div className="sidebar-1950"><b>1950</b><span>Materiales de construcción en Boal y Villayón</span></div>
          <SesionLinks />
        </>
      )}
    </aside>
  );
}

// ── Scroll restoration: saves/restores .app-main scroll on back navigation ──
function ScrollRestoration() {
  const { pathname } = useLocation();
  const navType = useNavigationType();
  const KEY = (p: string) => `scroll:${p}`;

  // Restore on POP (back/forward), scroll to top on PUSH/REPLACE
  useEffect(() => {
    const el = document.getElementById('app-main');
    if (!el) return;
    if (navType === 'POP') {
      const saved = sessionStorage.getItem(KEY(pathname));
      if (saved) { requestAnimationFrame(() => { el.scrollTop = parseInt(saved); }); return; }
    }
    el.scrollTop = 0;
  }, [pathname, navType]);

  // Save position before leaving
  const savedPath = useRef(pathname);
  useEffect(() => {
    const el = document.getElementById('app-main');
    return () => {
      if (el) sessionStorage.setItem(KEY(savedPath.current), String(el.scrollTop));
      savedPath.current = pathname;
    };
  }, [pathname]);

  return null;
}

function MobileHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const isDoc = location.pathname.startsWith('/documento/') || location.pathname.startsWith('/pedidos/') || location.pathname.startsWith('/producto/') || location.pathname.startsWith('/reparaciones/') || location.pathname.startsWith('/firmas/');

  // Find current section (for title + clickable root link)
  const section = navItems.find(n => location.pathname.startsWith(n.to) && n.to !== '/');
  const title = location.pathname === '/' ? '' : (section?.label ?? '');

  return (
    <header className="mobile-header">
      {isDoc ? (
        <button className="mobile-back-btn" onClick={() => navigate(-1)}>
          <ChevronLeft size={20} /> Volver
        </button>
      ) : (
        <Link to="/" style={{ textDecoration: 'none' }} aria-label="Inicio">
          <Logo size={location.pathname === "/" ? 24 : 30} compact={location.pathname !== "/"} />
        </Link>
      )}
      {/* Title is a link to section root — tapping it resets filters/scroll */}
      {section && !isDoc ? (
        <Link to={section.to} className="mobile-header-title" style={{ textDecoration: 'none', color: 'inherit' }}>
          {title}
        </Link>
      ) : (
        <span className="mobile-header-title">{title}</span>
      )}
      <div style={{ width: 28 }} />
    </header>
  );
}

function BottomNav({ badges }: { badges: NavBadge }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  // Close drawer on navigation
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  const isSecondaryActive = drawerItems.some(
    n => location.pathname === n.to || location.pathname.startsWith(n.to + '/')
  );

  return (
    <>
      {/* Backdrop */}
      {drawerOpen && (
        <div className="more-drawer-backdrop" onClick={() => setDrawerOpen(false)} />
      )}

      {/* Tools drawer */}
      <div className={`more-drawer${drawerOpen ? ' more-drawer-open' : ''}`}>
        <div className="more-drawer-handle" onClick={() => setDrawerOpen(false)} />
        <div className="more-drawer-title">Más apartados</div>
        {drawerGroups.map(g => (
          <div key={g.titulo}>
            <div className="more-drawer-grupo">{g.titulo}</div>
            <div className="more-drawer-grid">
              {g.items.map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} className={({ isActive }) => `more-drawer-item${isActive ? ' active' : ''}`}>
                  <Icon size={26} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
        <SesionLinks />
      </div>

      {/* Bottom nav */}
      <nav className="bottom-nav">
        {bottomItems.map(({ to, label, short, icon: Icon, badge, exact }) => {
          const count = badge ? badges[badge as keyof NavBadge] : 0;
          return (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}
            >
              <span className="bn-icon">
                <Icon size={22} />
                {count > 0 && (
                  <span className="bottom-badge">{count > 9 ? '9+' : count}</span>
                )}
              </span>
              <span>{short ?? label}</span>
            </NavLink>
          );
        })}
        {/* "More" button */}
        <button
          className={`bottom-nav-item${isSecondaryActive || drawerOpen ? ' active' : ''}`}
          onClick={() => setDrawerOpen(v => !v)}
        >
          <MoreHorizontal size={22} />
          <span>Más</span>
        </button>
      </nav>
    </>
  );
}

/** Vista reducida para el móvil del camionero (modo reparto). */
function RepartoShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const enLista = location.pathname === '/reparto';
  return (
    <div className="reparto-layout">
      <header className="reparto-header">
        {enLista ? (
          <Logo size={22} onDark />
        ) : (
          <button className="mobile-back-btn" onClick={() => navigate('/reparto')}>
            <ChevronLeft size={20} /> Volver
          </button>
        )}
        <span style={{ fontWeight: 700 }}>Reparto · Casa Fonso</span>
      </header>
      <main id="app-main" className="reparto-main">
        <ScrollRestoration />
        <Routes>
          <Route path="/reparto" element={<RepartoPage />} />
          <Route path="/firmas/:id" element={<FirmaDetailPage />} />
          <Route path="/turnos" element={<TurnosPage />} />
          <Route path="*" element={<Navigate to="/reparto" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function AppShell() {
  const location = useLocation();
  useEffect(() => { arrancarCola(); }, []);
  if (getRol() === 'reparto' || location.pathname === '/reparto' || isReparto()) return <RepartoShell />;
  return <FullShell />;
}

function FullShell() {
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 1200);
  const [badges, setBadges] = useState<NavBadge>({ repairs: 0, orders: 0, firmas: 0, correo: 0 });

  // Load badge counts (pending repairs + pending orders)
  useEffect(() => {
    const load = () => {
      getDashboardStats().then(({ data }) => {
        setBadges(b => ({
          ...b,
          repairs: data.repairs.pending,
          orders: data.orders.pending,
        }));
      }).catch(() => {});
      getFirmasStats().then(({ data }) => setBadges(b => ({ ...b, firmas: data.pendiente }))).catch(() => {});
      // Correos sin leer (en Inicio): para que se vean desde cualquier pantalla
      getCorreo().then(({ data }) => setBadges(b => ({ ...b, correo: data.configurado ? data.sin_leer.length : 0 }))).catch(() => {});
    };
    load();
    const interval = setInterval(load, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app-layout">
      <Sidebar badges={badges} collapsed={collapsed} onToggle={() => setCollapsed(v => !v)} />
      <div className="app-content">
        <MobileHeader />
        <main id="app-main" className="app-main">
          <ScrollRestoration />
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/albaranes" element={<HomePage />} />
            <Route path="/documento/:id" element={<DocumentPage />} />
            <Route path="/producto/:id" element={<ProductInfoPage />} />
            <Route path="/analisis" element={<AnalyticsPage />} />
            <Route path="/venta" element={<SalePage />} />
            <Route path="/reparaciones" element={<RepairsPage />} />
            <Route path="/reparaciones/:id" element={<RepairDetailPage />} />
            <Route path="/pedidos" element={<OrdersPage />} />
            <Route path="/pedidos/:id" element={<OrderDetailPage />} />
            <Route path="/catalogo" element={<CatalogPage />} />
            <Route path="/consulta" element={<PriceLookupPage />} />
            <Route path="/etiquetas" element={<CustomLabelsPage />} />
            <Route path="/firmas" element={<FirmasPage />} />
            <Route path="/firmas/:id" element={<FirmaDetailPage />} />
            <Route path="/turnos" element={<TurnosPage />} />
          </Routes>
        </main>
        <BottomNav badges={badges} />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AccessGate>
        <AppShell />
      </AccessGate>
    </BrowserRouter>
  );
}
