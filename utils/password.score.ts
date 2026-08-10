/**
 * Password Scoring Utility - Evaluates password strength and security
 * This utility provides a comprehensive password strength scoring system
 * that evaluates passwords based on length, character variety, and common weak patterns
 */

/**
 * Evaluates password strength and returns a score from 0 to 100
 * Higher scores indicate stronger passwords with better security characteristics
 * 
 * Scoring criteria:
 * - Length: Up to 40 points (4 points per character, max 40)
 * - Character variety: Up to 40 points (10 points per character type)
 * - Bonus for long & varied passwords: Up to 20 points
 * - Penalties for weak patterns: -20 points
 * 
 * @param password - Password string to evaluate
 * @returns Password strength score from 0 to 100
 */
export function scorePassword(password: string): number {
    let score = 0;

    // ===== VALIDATE INPUT =====
    // Return 0 for empty or null passwords
    if (!password) return 0;

    const length = password.length;

    // ===== CHECK CHARACTER VARIETY =====
    // Test for different character types to encourage complexity
    const hasLower = /[a-z]/.test(password);      // Lowercase letters
    const hasUpper = /[A-Z]/.test(password);      // Uppercase letters
    const hasNumber = /\d/.test(password);        // Numbers
    const hasSymbol = /[!@#$%^&*(),.?":{}|<>]/.test(password); // Special symbols

    // Count how many different character types are used
    const charsetCount = [hasLower, hasUpper, hasNumber, hasSymbol].filter(Boolean).length;

    // ===== CALCULATE BASE SCORE =====
    // Award points for password length (4 points per character, max 40)
    score += Math.min(length * 4, 40);

    // ===== AWARD CHARACTER VARIETY BONUS =====
    // Award 10 points for each character type used (max 40 points)
    score += charsetCount * 10;

    // ===== AWARD BONUS FOR LONG & VARIED PASSWORDS =====
    // Bonus for passwords that are both long and varied
    if (length >= 12 && charsetCount >= 3) score += 10;  // Good password
    if (length >= 16 && charsetCount === 4) score += 10; // Excellent password

    // ===== APPLY PENALTIES FOR WEAK PATTERNS =====
    // Define common weak password patterns that should be penalized
    const weakPatterns = [
        /^(.)\1+$/,        // Repeated characters (e.g., "aaaaaa")
        /^12345678$/,      // Sequential numbers
        /^password$/i,     // Common word "password"
        /^qwerty$/i,       // Common word "qwerty"
        /^(.){1,3}$/,      // Very short passwords with low entropy
    ];
    
    // Check for weak patterns and apply penalty
    for (const pattern of weakPatterns) {
        if (pattern.test(password)) {
            score -= 20; // Apply penalty for weak patterns
            break;       // Only apply one penalty (worst case)
        }
    }

    // ===== RETURN FINAL SCORE =====
    // Ensure score is within valid range (0-100)
    return Math.max(0, Math.min(score, 100));
}
  