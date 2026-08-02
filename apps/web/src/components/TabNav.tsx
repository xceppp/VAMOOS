import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useI18n } from '../i18n/I18nProvider';

export interface TabItem {
  to: string;
  label: string;
  short: string;
  end?: boolean;
}

interface TabNavProps {
  items: TabItem[];
}

export function TabNav({ items }: TabNavProps) {
  const { dir } = useI18n();
  const location = useLocation();
  const listRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  const activeTo =
    items.find((item) =>
      item.end
        ? location.pathname === item.to
        : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`),
    )?.to ?? items[0]?.to;

  const measure = () => {
    const el = activeTo ? itemRefs.current.get(activeTo) : null;
    const list = listRef.current;
    if (!el || !list) return;
    const listBox = list.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    setIndicator({
      left: box.left - listBox.left + list.scrollLeft,
      width: box.width,
    });
  };

  useLayoutEffect(() => {
    measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTo, dir, items]);

  useEffect(() => {
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    const list = listRef.current;
    list?.addEventListener('scroll', onResize, { passive: true });
    return () => {
      window.removeEventListener('resize', onResize);
      list?.removeEventListener('scroll', onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTo, dir]);

  return (
    <nav className="tab-nav" aria-label="Primary" ref={listRef as never}>
      <div className="tab-nav__track">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `tab-nav__item${isActive ? ' tab-nav__item--active' : ''}`}
            ref={(node) => {
              if (node) itemRefs.current.set(item.to, node);
              else itemRefs.current.delete(item.to);
            }}
          >
            <span className="tab-nav__full">{item.label}</span>
            <span className="tab-nav__short">{item.short}</span>
          </NavLink>
        ))}
        <span
          className="tab-nav__indicator"
          style={{ left: indicator.left, width: indicator.width }}
          aria-hidden
        />
      </div>
    </nav>
  );
}
