import { BrowserRouter, Routes, Route, NavLink, Link, useNavigate, useLocation, useNavigationType } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard, FileText, Wrench, ShoppingCart,
  BarChart2, Store, ChevronLeft, Menu, BookOpen, Search, Tag, MoreHorizontal
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
import { getDashboardStats } from './api/client';

interface NavBadge {
  repairs: number;
  orders: number;
}

// Primary items → shown in sidebar AND mobile bottom nav (no Inicio — CF logo is the home link)
const primaryNavItems = [
  { to: '/albaranes', label: 'Albaranes', icon: FileText },
  { to: '/consulta', label: 'Consulta', icon: Search },
  { to: '/reparaciones', label: 'Reparaciones', icon: Wrench, badge: 'repairs' as const },
  { to: '/pedidos', label: 'Pedidos', icon: ShoppingCart, badge: 'orders' as const },
];

// Secondary items → sidebar only (desktop)
const secondaryNavItems = [
  { to: '/catalogo',  label: 'Catálogo',  icon: BookOpen },
  { to: '/analisis',  label: 'Análisis',  icon: BarChart2 },
  { to: '/venta',     label: 'Venta',     icon: Store },
  { to: '/etiquetas', label: 'Etiquetas', icon: Tag },
];

const navItems = [...primaryNavItems, ...secondaryNavItems];

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
              <Icon size={18} />
              {count > 0 && <span className="sidebar-badge">{count > 99 ? '99+' : count}</span>}
            </span>
            {!collapsed && <span className="sidebar-item-label">{label}</span>}
          </NavLink>
        );
      })}
    </>
  );
}

function Sidebar({ badges, collapsed, onToggle }: { badges: NavBadge; collapsed: boolean; onToggle: () => void }) {
  return (
    <aside className={`sidebar${collapsed ? ' sidebar-collapsed' : ''}`}>
      {/* Logo — also acts as Home link */}
      <div className="sidebar-logo">
        <NavLink to="/" end className={({ isActive }) => `sidebar-logo-icon${isActive ? ' active' : ''}`}
          style={{ textDecoration: 'none', color: 'inherit' }}>
          CF
        </NavLink>
        {!collapsed && (
          <div className="sidebar-logo-text">
            <NavLink to="/" end style={{ textDecoration: 'none', color: 'inherit' }}>
              <span className="sidebar-logo-name">Casa Fonso</span>
            </NavLink>
          </div>
        )}
        <button className="sidebar-collapse-btn" onClick={onToggle} title={collapsed ? 'Expandir' : 'Colapsar'}>
          {collapsed ? <Menu size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Primary nav */}
      <nav className="sidebar-nav">
        {/* Inicio only in sidebar, not in bottom nav */}
        <NavLink to="/" end className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}
          title={collapsed ? 'Inicio' : undefined}>
          <span className="sidebar-item-icon"><LayoutDashboard size={18} /></span>
          {!collapsed && <span className="sidebar-item-label">Inicio</span>}
        </NavLink>
        <SidebarNavGroup items={primaryNavItems} badges={badges} collapsed={collapsed} />
      </nav>

      {/* Secondary nav */}
      <nav className="sidebar-nav sidebar-nav-secondary">
        {!collapsed && (
          <div className="sidebar-section-label">Herramientas</div>
        )}
        <SidebarNavGroup items={secondaryNavItems} badges={badges} collapsed={collapsed} />
      </nav>
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
  const isDoc = location.pathname.startsWith('/documento/') || location.pathname.startsWith('/pedidos/') || location.pathname.startsWith('/producto/') || location.pathname.startsWith('/reparaciones/');

  // Find current section (for title + clickable root link)
  const section = navItems.find(n => location.pathname.startsWith(n.to) && n.to !== '/');
  const title = location.pathname === '/' ? 'Casa Fonso' : (section?.label ?? 'Casa Fonso');

  return (
    <header className="mobile-header">
      {isDoc ? (
        <button className="mobile-back-btn" onClick={() => navigate(-1)}>
          <ChevronLeft size={20} /> Volver
        </button>
      ) : (
        <Link to="/" style={{ textDecoration: 'none' }}>
          <div className="sidebar-logo-icon" style={{ width: 28, height: 28, fontSize: 10 }}>CF</div>
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

  const isSecondaryActive = secondaryNavItems.some(
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
        <div className="more-drawer-title">Herramientas</div>
        <div className="more-drawer-grid">
          {secondaryNavItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `more-drawer-item${isActive ? ' active' : ''}`}
            >
              <Icon size={26} />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </div>

      {/* Bottom nav */}
      <nav className="bottom-nav">
        {primaryNavItems.map(({ to, label, icon: Icon, badge, exact }) => {
          const count = badge ? badges[badge as keyof NavBadge] : 0;
          return (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}
            >
              <span style={{ position: 'relative', display: 'inline-flex' }}>
                <Icon size={22} />
                {count > 0 && (
                  <span className="bottom-badge">{count > 9 ? '9+' : count}</span>
                )}
              </span>
              <span>{label}</span>
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

function AppShell() {
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 1200);
  const [badges, setBadges] = useState<NavBadge>({ repairs: 0, orders: 0 });

  // Load badge counts (pending repairs + pending orders)
  useEffect(() => {
    const load = () => {
      getDashboardStats().then(({ data }) => {
        setBadges({
          repairs: data.repairs.pending,
          orders: data.orders.pending,
        });
      }).catch(() => {});
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
      <AppShell />
    </BrowserRouter>
  );
}
