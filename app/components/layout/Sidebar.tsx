'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, CheckSquare, FileText, Book, Settings } from 'lucide-react';
import { useState, useEffect } from 'react';

const navItems = [
  { name: 'Home', icon: Home, href: '/protected' },
  { name: 'Tasks', icon: CheckSquare, href: '/protected/tasks' },
  { name: 'Forms', icon: FileText, href: '/protected/forms' },
  { name: 'Site Diaries', icon: Book, href: '/protected/site-diaries' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', isExpanded ? '12rem' : '4rem');
  }, [isExpanded]);

  return (
    <aside 
      className={`w-16 bg-[#2A2E34] h-screen flex flex-col py-4 fixed left-0 top-0 z-30 transition-all duration-300 overflow-hidden ${
        isExpanded ? 'w-48' : 'w-16'
      }`}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      <div className="flex flex-col space-y-2 flex-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`relative flex items-center mx-2 py-2 rounded-lg transition-colors duration-200 ${
                isActive 
                  ? 'bg-indigo-500 text-white' 
                  : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-100'
              }`}
            >
              <div className="w-12 flex items-center justify-center">
                <Icon className="w-5 h-5" />
              </div>
              <span className={`absolute left-12 text-sm whitespace-nowrap transition-all duration-300 ${
                isExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'
              }`}>
                {item.name}
              </span>
            </Link>
          );
        })}
      </div>
      <Link
        href="/protected/settings"
        className={`relative flex items-center mx-2 py-2 rounded-lg text-gray-400 hover:bg-gray-700/50 hover:text-gray-100 transition-colors duration-200`}
      >
        <div className="w-12 flex items-center justify-center">
          <Settings className="w-5 h-5" />
        </div>
        <span className={`absolute left-12 text-sm whitespace-nowrap transition-all duration-300 ${
          isExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'
        }`}>
          Settings
        </span>
      </Link>
    </aside>
  );
} 