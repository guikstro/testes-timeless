import { customAlphabet } from "nanoid";

// Unambiguous alphabet (no 0/O/1/l/I) since codes are read aloud/typed manually.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const nanoid = customAlphabet(ALPHABET, 7);

/** Generates a short, URL-safe code for a trackable link (e.g. `go.dominio.com/<code>`). */
export function generateTrackingCode(): string {
  return nanoid();
}
