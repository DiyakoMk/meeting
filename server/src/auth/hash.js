import bcrypt from 'bcrypt';

const ROUNDS = 10;

export const hashPassword = (plain) => bcrypt.hash(plain, ROUNDS);
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);
