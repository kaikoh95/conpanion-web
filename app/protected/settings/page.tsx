import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Building2,
  User,
  Bell,
  Shield,
  Palette,
  Database,
  FolderOpen,
  ArrowRight,
} from 'lucide-react';

export default function SettingsPage() {
  const settingsCategories = [
    {
      title: 'Organizations',
      description: 'Manage your organizations, members, and multi-tenancy settings',
      icon: Building2,
      href: '/protected/settings/organizations',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'Projects',
      description: 'Manage your projects, settings, and project members',
      icon: FolderOpen,
      href: '/protected/settings/projects',
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
    },
    {
      title: 'Profile',
      description: 'Update your personal information and account preferences',
      icon: User,
      href: '/protected/settings/profile',
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Notifications',
      description: 'Configure how and when you receive notifications',
      icon: Bell,
      href: '/protected/settings/notifications',
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-50',
      comingSoon: true,
    },
    {
      title: 'Security',
      description: 'Manage your password, two-factor authentication, and security settings',
      icon: Shield,
      href: '/protected/settings/security',
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      comingSoon: true,
    },
    {
      title: 'Appearance',
      description: 'Customize the look and feel of your application',
      icon: Palette,
      href: '/protected/settings/appearance',
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      comingSoon: true,
    },
    {
      title: 'Data & Privacy',
      description: 'Control your data, privacy settings, and export options',
      icon: Database,
      href: '/protected/settings/data-privacy',
      color: 'text-gray-600',
      bgColor: 'bg-gray-50',
      comingSoon: true,
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your account settings and preferences</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {settingsCategories.map((category) => {
          const IconComponent = category.icon;

          const cardContent = (
            <Card
              className={`h-full transition-all duration-200 hover:shadow-md ${
                category.comingSoon ? 'opacity-60 hover:shadow-none' : 'hover:border-primary/50'
              }`}
            >
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className={`rounded-lg p-2 ${category.bgColor}`}>
                    <IconComponent className={`h-6 w-6 ${category.color}`} />
                  </div>
                  {!category.comingSoon && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
                  {category.comingSoon && (
                    <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                      Coming Soon
                    </span>
                  )}
                </div>
                <CardTitle className="text-lg">{category.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-sm">{category.description}</CardDescription>
              </CardContent>
            </Card>
          );

          if (category.comingSoon) {
            return (
              <div key={category.title} className="block cursor-not-allowed">
                {cardContent}
              </div>
            );
          }

          return (
            <Link key={category.title} href={category.href} className="block cursor-pointer">
              {cardContent}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
