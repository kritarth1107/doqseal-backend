import config from "../config/app.config";
import CryptoJS from "crypto-js";

/**
 * Encryption Utility - Handles AES encryption, decryption, and hashing operations
 * This utility provides secure cryptographic functions for sensitive data handling,
 * including text encryption/decryption and SHA-256 hashing for data integrity
 */

// ==================================================
// Types and Interfaces
// ==================================================

/**
 * Encryption service interface
 * Defines the contract for encryption operations including encrypt, decrypt, hash, and verify
 */
export interface IEncryptionService {
    encrypt(text: string): string;           // Encrypt plain text to cipher text
    decrypt(encryptedText: string): string;  // Decrypt cipher text to plain text
    hash(text: string): string;              // Create SHA-256 hash of text
    verify(text: string, hash: string): boolean; // Verify text against hash
}

// ==================================================
// Constants and Configuration
// ==================================================

/**
 * Secret key for AES encryption
 * Retrieved from application configuration
 */
const SECRET_KEY = config.encryption.secretKey;

// ===== VALIDATE SECRET KEY =====
// Ensure secret key meets minimum security requirements
if (!SECRET_KEY || SECRET_KEY.length < 32) {
    throw new Error(
        "SECRET_KEY must be at least 32 bytes long and set in the environment variables."
    );
}

// ==================================================
// Encryption Service Implementation
// ==================================================

/**
 * AES encryption service implementation
 * Provides AES encryption/decryption and SHA-256 hashing capabilities
 */
const AES: IEncryptionService = {
    /**
     * Encrypt text using AES encryption algorithm
     * @param text - Plain text to encrypt
     * @returns Encrypted text as base64 string
     */
    encrypt: (text: string): string => {
        try {
            // ===== VALIDATE INPUT =====
            // Check if text to encrypt is provided
            if (!text) {
                throw new Error("Text to encrypt cannot be empty");
            }
            
            // ===== PERFORM ENCRYPTION =====
            // Use CryptoJS AES encryption with the secret key
            return CryptoJS.AES.encrypt(text, SECRET_KEY).toString();
        } catch (error) {
            console.error("Encryption error:", error);
            throw new Error("Failed to encrypt text");
        }
    },

    /**
     * Decrypt text using AES decryption algorithm
     * @param encryptedText - Encrypted text to decrypt
     * @returns Decrypted plain text
     */
    decrypt: (encryptedText: string): string => {
        try {
            // ===== VALIDATE INPUT =====
            // Check if encrypted text is provided
            if (!encryptedText) {
                throw new Error("Encrypted text cannot be empty");
            }
            
            // ===== PERFORM DECRYPTION =====
            // Decrypt the text using AES with the secret key
            const bytes = CryptoJS.AES.decrypt(encryptedText, SECRET_KEY);
            const decryptedText = bytes.toString(CryptoJS.enc.Utf8);
            
            // ===== VALIDATE DECRYPTION RESULT =====
            // Check if decryption was successful
            if (!decryptedText) {
                throw new Error("Decryption failed - invalid key or corrupted data");
            }
            
            return decryptedText;
        } catch (error) {
            console.error("Decryption error:", error);
            throw new Error("Failed to decrypt text");
        }
    },

    /**
     * Create SHA-256 hash of text
     * @param text - Text to hash
     * @returns SHA-256 hash as hexadecimal string
     */
    hash: (text: string): string => {
        try {
            // ===== VALIDATE INPUT =====
            // Check if text to hash is provided
            if (!text) {
                throw new Error("Text to hash cannot be empty");
            }
            
            // ===== PERFORM HASHING =====
            // Create SHA-256 hash of the text
            return CryptoJS.SHA256(text).toString();
        } catch (error) {
            console.error("Hashing error:", error);
            throw new Error("Failed to hash text");
        }
    },

    /**
     * Verify text against a hash
     * @param text - Plain text to verify
     * @param hash - Hash to verify against
     * @returns True if text matches hash, false otherwise
     */
    verify: (text: string, hash: string): boolean => {
        try {
            // ===== VALIDATE INPUTS =====
            // Check if both text and hash are provided
            if (!text || !hash) {
                throw new Error("Text and hash cannot be empty");
            }
            
            // ===== PERFORM VERIFICATION =====
            // Create hash of the text and compare with provided hash
            const textHash = CryptoJS.SHA256(text).toString();
            return textHash === hash;
        } catch (error) {
            console.error("Verification error:", error);
            throw new Error("Failed to verify text against hash");
        }
    }
};

export default AES;
