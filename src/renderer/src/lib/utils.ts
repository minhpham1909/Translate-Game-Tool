/**
 * utils.ts
 * Hàm tiện ích `cn()` dùng để merge Tailwind CSS classes.
 * Kết hợp clsx (lọc falsy values) với tailwind-merge (giải quyết conflict classes).
 */
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge các Tailwind class một cách thông minh.
 * @param inputs Danh sách class string hoặc conditional expressions
 * @returns Chuỗi class đã được merge và deduplicate
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
