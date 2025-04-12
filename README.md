# Conpanion Web

A task management system built with Next.js, Supabase, and Tailwind CSS.

## Prerequisites

- Node.js (v20.18.1 or higher)
- [Supabase CLI](https://supabase.com/docs/guides/cli)
- npm

## Getting Started

1. Clone the repository:
```bash
git clone <repository-url>
cd conpanion-web
```

2. Install dependencies:
```bash
npm install
```

3. Set up Supabase locally:
```bash
# Start Supabase services
supabase start

# Run database migrations and seed data
npm run db:reset
```

4. Set up your environment variables:
```bash
cp .env.example .env.local
```
Update the following variables in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

5. Start the development server:
```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to see your application.

## Development Workflow

### To seed database

```
cp seed.example seed.sql
npm run db:reset
```

### Database Changes

Link your local project to your remote Supabase project
```bash
npm run sb link --project-ref your-project-ref
```

1. Create a new migration:
```bash
supabase migration new <migration-name>
```

2. Edit the migration file in `supabase/migrations/`

3. Apply migrations locally and update types:
```bash
npm run db:reset
```

4. Push migrations to remote database:
```bash
# Then push the migrations
npm run sb db push
```

5. Working with database data:
```bash
# Generate a dump of your database data against the remote db
npm run db:dump

# Quick access to Supabase CLI commands
npm run sb -- <command>
```

### Type Generation

Types are automatically generated when:
- Running `npm run db:reset`
- Making changes to migration files (via pre-commit hook)

To manually generate types from your local database:
```bash
npm run types:db
```

### Other available Scripts

- `npm run dev` - Start the development server
- `npm run build` - Build the production application
- `npm run start` - Start the production server
- `npm run lint` - Run ESLint

## Project Structure

```
conpanion-web/
├── app/                    # Next.js app directory
│   ├── components/        # React components
│   ├── lib/              # Utility functions and shared code
│   └── protected/        # Protected routes
├── supabase/             # Supabase configuration
│   ├── migrations/      # Database migrations
│   └── seed.sql        # Seed data
└── lib/
    └── supabase/       # Supabase client and types
```

## Database Schema

The application uses the following main tables:
- `tasks` - Task management
- `statuses` - Task statuses (e.g., To Do, In Progress)
- `priorities` - Task priorities
- `labels` - Task labels
- `entity_assignees` - Task assignments
- `entity_labels` - Task label associations

## Authentication

The application uses Supabase Auth with email/password authentication. Default test accounts:

- Admin User:
  - Email: kaikoh95@gmail.com or sebapian95@gmail.com
  - Password: password123

- Regular User:
  - Email: user@example.com
  - Password: password123

## Contributing

1. Create a feature branch:
```bash
git checkout -b feature/your-feature-name
```

2. Make your changes and commit:
```bash
git add .
git commit -m "Description of changes"
```

3. Push your branch and create a pull request:
```bash
git push origin feature/your-feature-name
```

## License

[Add your license information here]

