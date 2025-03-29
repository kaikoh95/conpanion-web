'use client';

import { Search, Bell, User } from 'lucide-react';
import { signOutAction } from '@/app/actions';

export default function TopBar() {
  return (
    <header 
      className="h-14 bg-white border-b flex items-center justify-between px-4 fixed top-0 right-0 z-20 transition-[left] duration-300"
      style={{ left: 'var(--sidebar-width)' }}
    >
      <div className="flex items-center flex-1 max-w-2xl">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search everything..."
            className="w-full pl-10 pr-4 py-1.5 text-sm bg-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>
      
      <div className="flex items-center space-x-4">
        <button className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg">
          <Bell className="w-5 h-5" />
        </button>
        <div className="relative group">
          <button className="flex items-center space-x-1 p-1 hover:bg-gray-100 rounded-lg">
            <div className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center text-white">
              <User className="w-5 h-5" />
            </div>
          </button>
          <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
            <div className="p-2">
              <button className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded">
                Profile Settings
              </button>
              <form action={signOutAction}>
                <button type="submit" className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded">
                  Sign Out
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
} 