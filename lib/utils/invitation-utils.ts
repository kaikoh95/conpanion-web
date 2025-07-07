/**
 * Utility functions for invitation handling and validation
 */

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates if a string is a valid UUID format
 */
export const isValidUUID = (str: string): boolean => {
  return UUID_REGEX.test(str);
};

/**
 * Extracts invitation token from URL pathname
 */
export const extractInvitationToken = (pathname: string): string | null => {
  const pathParts = pathname.split('/');

  // Handle /invitation/[token] routes
  if (pathParts[1] === 'invitation' && pathParts[2]) {
    return pathParts[2];
  }

  // Handle /api/invitations/[token] routes
  if (pathParts[1] === 'api' && pathParts[2] === 'invitations' && pathParts[3]) {
    return pathParts[3];
  }

  return null;
};

/**
 * Validates invitation route and returns validation result
 */
export const validateInvitationRoute = (
  pathname: string,
): {
  isValid: boolean;
  token: string | null;
  error?: string;
} => {
  const token = extractInvitationToken(pathname);

  if (!token) {
    return {
      isValid: false,
      token: null,
      error: 'No invitation token found in URL',
    };
  }

  // Allow 'invalid' as a special case for error pages
  if (token === 'invalid') {
    return {
      isValid: true,
      token: token,
    };
  }

  if (!isValidUUID(token)) {
    return {
      isValid: false,
      token: token,
      error: 'Invalid invitation token format',
    };
  }

  return {
    isValid: true,
    token: token,
  };
};

/**
 * Checks if a route is an invitation-related route
 */
export const isInvitationRoute = (pathname: string): boolean => {
  return pathname.startsWith('/invitation/') || pathname.startsWith('/api/invitations/');
};

/**
 * Gets the appropriate redirect URL for invalid invitation tokens
 */
export const getInvalidInvitationRedirect = (baseUrl: string): string => {
  return `${baseUrl}/invitation/invalid`;
};
