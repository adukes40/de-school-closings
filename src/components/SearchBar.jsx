import React, { useState, useMemo, useEffect, useRef } from 'react';

const STATUS_LABELS = {
  closed: 'Closed',
  delay: 'Delay',
  'early dismissal': 'Early Dismissal',
  info: 'Informational',
};

function SearchBar({ items, onSelect }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const wrapperRef = useRef(null);

  // ── Filter items by query ──────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase().trim();
    return items
      .filter(item => item.name.toLowerCase().includes(q))
      .slice(0, 20);
  }, [query, items]);

  // Reset active index when results change
  useEffect(() => { setActiveIndex(-1); }, [filtered]);

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const el = listRef.current.children[activeIndex];
      if (el) el.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function selectItem(item) {
    setQuery(item.name);
    setIsOpen(false);
    setActiveIndex(-1);
    onSelect(item);
  }

  function handleClear() {
    setQuery('');
    setIsOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }

  function handleKeyDown(e) {
    if (!isOpen || filtered.length === 0) {
      if (e.key === 'Escape') { setQuery(''); setIsOpen(false); }
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(prev => Math.min(prev + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < filtered.length) {
          selectItem(filtered[activeIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setQuery('');
        inputRef.current?.blur();
        break;
      default:
        break;
    }
  }

  return (
    <div className="search-bar" ref={wrapperRef}>
      <div className="search-input-wrapper">
        <svg className="search-icon" viewBox="0 0 16 16" width="14" height="14">
          <path fill="currentColor" d="M10.68 11.74a6 6 0 1 1 1.06-1.06l3.04 3.04a.75.75 0 1 1-1.06 1.06l-3.04-3.04ZM11.5 7a4.5 4.5 0 1 0-9 0 4.5 4.5 0 0 0 9 0Z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          className="search-input"
          placeholder="Search schools & districts..."
          value={query}
          onChange={e => { setQuery(e.target.value); setIsOpen(true); setActiveIndex(-1); }}
          onFocus={() => { if (query.trim()) setIsOpen(true); }}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-expanded={isOpen}
          aria-controls="search-listbox"
          aria-activedescendant={activeIndex >= 0 ? `search-option-${activeIndex}` : undefined}
        />
        {query && (
          <button className="search-clear" onClick={handleClear} aria-label="Clear search">
            <svg viewBox="0 0 16 16" width="12" height="12">
              <path fill="currentColor" d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
            </svg>
          </button>
        )}
      </div>

      {isOpen && filtered.length > 0 && (
        <ul className="search-dropdown" ref={listRef} id="search-listbox" role="listbox">
          {filtered.map((item, i) => (
            <li
              key={`${item.type}-${item.name}`}
              id={`search-option-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              className={`search-option ${i === activeIndex ? 'search-option-active' : ''}`}
              onClick={() => selectItem(item)}
              onMouseEnter={() => setActiveIndex(i)}
            >
              <div className="search-option-name">{item.name}</div>
              <div className="search-option-meta">
                <span className={`search-type-badge search-type-${item.type}`}>{item.typeLabel}</span>
                {item.closing ? (
                  <span className={`search-status search-status-${item.closing.statusType.replace(/\s+/g, '-')}`}>
                    {STATUS_LABELS[item.closing.statusType] || item.closing.statusType}
                  </span>
                ) : (
                  <span className="search-status search-status-open">Open</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {isOpen && query.trim() && filtered.length === 0 && (
        <div className="search-dropdown search-no-results">No results found</div>
      )}
    </div>
  );
}

export default SearchBar;
