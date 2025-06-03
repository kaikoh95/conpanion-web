# Debug Mode

This project includes a debug mode that allows you to conditionally show debug UI elements across the entire application.

## Environment Variable

To enable debug mode, set the following environment variable:

```bash
NEXT_PUBLIC_DEBUG=true
```

To disable debug mode (default):

```bash
NEXT_PUBLIC_DEBUG=false
```

## Usage

### For Local Development

Add to your `.env.local` file:

```
NEXT_PUBLIC_DEBUG=true
```

### For Production

Debug mode should always be disabled in production by ensuring:

```
NEXT_PUBLIC_DEBUG=false
```

## How It Works

The debug functionality is implemented using:

1. **Debug Utility** (`utils/debug.ts`) - Provides functions to check if debug mode is enabled
2. **DebugWrapper Component** - Conditionally renders debug content only when debug mode is enabled

## Debug Elements Currently Included

- **Organization Members Page**: Debug buttons for testing member operations
- **Organizations Settings Page**: API debug information and raw context data
- **Site Diary View**: Debug information about user permissions and approval status

## Adding New Debug Elements

To add debug elements to any component:

```tsx
import { DebugWrapper } from '@/utils/debug';

function MyComponent() {
  return (
    <div>
      {/* Regular content */}

      <DebugWrapper>
        {/* This will only show when NEXT_PUBLIC_DEBUG=true */}
        <div className="border border-yellow-400 bg-yellow-50 p-4">
          <h3>Debug Information</h3>
          <p>This is only visible in debug mode</p>
        </div>
      </DebugWrapper>
    </div>
  );
}
```

## Benefits

- **Clean Production**: No debug elements visible to end users
- **Developer Friendly**: Easy to enable/disable debug features during development
- **Conditional Rendering**: Zero performance impact when debug mode is disabled
- **Consistent Pattern**: Standardized way to handle debug UI across the app

## Security Note

Since this uses `NEXT_PUBLIC_DEBUG`, the value is exposed to the client. Never put sensitive information in debug elements that shouldn't be visible to users.
