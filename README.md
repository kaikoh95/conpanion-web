# Conpanion Web

A modern SaaS Project Management tool built specifically for construction companies. Think JIRA or ClickUp, but tailored for the construction industry.

## Tech Stack

- **Framework:** [Next.js](https://nextjs.org/) (App Router)
- **Database:** [Supabase](https://supabase.com/)
- **Authentication:** Supabase Auth
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **UI Components:** [Radix UI](https://www.radix-ui.com/)
- **Drag & Drop:** [dnd kit](https://dndkit.com/)
- **Forms:** React Hook Form
- **Date Handling:** [date-fns](https://date-fns.org/)
- **Icons:** [Lucide](https://lucide.dev/)
- **Notifications:** [Sonner](https://sonner.emilkowal.ski/)

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- Supabase CLI

### Installation

1. Clone the repository:

   ```bash
   git clone <your-repo-url>
   cd conpanion-web
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Set up your environment variables:

   ```bash
   cp .env.example .env.local
   ```

   Then update the values in `.env.local` with your Supabase credentials.

4. Start the development server:
   ```bash
   npm run dev
   ```

## Development Workflow

### Available Scripts

- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run prettier` - Check code formatting
- `npm run prettier:fix` - Fix code formatting
- `npm run types:db` - Generate TypeScript types from Supabase
- `npm run db:dump` - Dump database data
- `npm run db:reset` - Reset database and regenerate types

### Code Quality Tools

- **Prettier** - Code formatting

  - Configuration in `.prettierrc`
  - Ignores specified in `.prettierignore`
  - Automatic Tailwind CSS class sorting

- **ESLint** - Code linting

  - Extends Next.js ESLint configuration
  - TypeScript support enabled

- **Husky & lint-staged** - Pre-commit hooks
  - Formats code before commits
  - Regenerates types for database changes
  - Runs linting checks

### Database Management

The project uses Supabase for database management. Key commands:

- Generate types: `npm run types:db`
- Reset database: `npm run db:reset`
- Dump database: `npm run db:dump`

### Styling

- Tailwind CSS for utility-first styling
- Custom components built with Radix UI primitives
- Consistent formatting with prettier-plugin-tailwindcss

## Project Structure

```
├── app/                  # Next.js app router pages
├── components/          # Reusable components
├── lib/                 # Utility functions and types
├── public/             # Static assets
└── supabase/           # Database migrations and types
```

## Contributing

1. Create a new branch
2. Make your changes
3. Run tests and ensure formatting is correct
   ```bash
   npm run lint
   npm run prettier
   ```
4. Submit a pull request

## License

[License Type] - See LICENSE file for details
