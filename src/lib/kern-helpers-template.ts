// This file contains the template for src/kern/helpers.ts that gets
// installed into the user's repository. It's stored as a plain string
// export to avoid template literal escaping issues.

export const HELPERS_TS = `import { readFileSync } from 'fs'
import { join } from 'path'
import { glob } from 'glob'

const KERN_ROOT = join(process.cwd(), 'src/kern')
const GLOBALS_PATH = join(KERN_ROOT, 'globals')
const CONTENT_PATH = join(KERN_ROOT, 'content')

// ----------------------------------------
// Globals
// ----------------------------------------

/**
 * Reads a global file
 * src/kern/globals/{name}.json
 *
 * @example
 * const contact = getGlobal('contact')
 */
export function getGlobal<T = any>(name: string): T {
  const path = join(GLOBALS_PATH, \`\${name}.json\`)
  try {
    const raw = readFileSync(path, 'utf-8')
    return JSON.parse(raw) as T
  } catch (e) {
    console.warn(
      \`[kern] Global "\${name}" not found or invalid JSON.\\n\` +
      \`Expected at: \${path}\`
    )
    return {} as T
  }
}

/**
 * Returns all globals
 *
 * @example
 * const allGlobals = getAllGlobals()
 * // { contact: {...}, navigation: {...} }
 */
export function getAllGlobals(): Record<string, any> {
  try {
    const files = glob.sync('*.json', { cwd: GLOBALS_PATH })
    return Object.fromEntries(
      files.map(file => {
        const name = file.replace('.json', '')
        return [name, getGlobal(name)]
      })
    )
  } catch (e) {
    return {}
  }
}

// ----------------------------------------
// Sections
// ----------------------------------------

/**
 * Reads a section file
 * src/kern/content/{page}/{section}.json
 *
 * @example
 * const hero = getSection('home', 'hero')
 */
export function getSection<T = any>(
  page: string,
  section: string
): T {
  const path = join(CONTENT_PATH, page, \`\${section}.json\`)
  try {
    const raw = readFileSync(path, 'utf-8')
    return JSON.parse(raw) as T
  } catch (e) {
    console.warn(
      \`[kern] Section "\${section}" on page "\${page}" not found or invalid JSON.\\n\` +
      \`Expected at: \${path}\`
    )
    return {} as T
  }
}

/**
 * Returns all sections of a page
 *
 * @example
 * const homeSections = getPageSections('home')
 * // { hero: {...}, features: {...} }
 */
export function getPageSections(
  page: string
): Record<string, any> {
  const pagePath = join(CONTENT_PATH, page)
  try {
    const files = glob.sync('*.json', { cwd: pagePath })
    return Object.fromEntries(
      files
        .filter(f => !f.endsWith('.kern.json'))
        .map(file => {
          const name = file.replace('.json', '')
          return [name, getSection(page, name)]
        })
    )
  } catch (e) {
    console.warn(
      \`[kern] Page "\${page}" not found.\\n\` +
      \`Expected at: \${pagePath}\`
    )
    return {}
  }
}

/**
 * Returns all page names
 *
 * @example
 * const pages = getAllPages()
 * // ['home', 'about', 'contact']
 */
export function getAllPages(): string[] {
  try {
    const dirs = glob.sync('*/', { cwd: CONTENT_PATH })
    return dirs.map(d => d.replace('/', ''))
  } catch (e) {
    return []
  }
}

// ----------------------------------------
// Repeater helpers
// ----------------------------------------

interface RepeaterOptions<T> {
  filter?: (item: T) => boolean
  sort?: keyof T | ((a: T, b: T) => number)
  limit?: number
}

/**
 * Filters and sorts a repeater
 *
 * @example
 * const reviews = getRepeater(data.reviews, {
 *   filter: r => r.active,
 *   sort: 'date',
 *   limit: 3
 * })
 */
export function getRepeater<T = any>(
  items: T[],
  options?: RepeaterOptions<T>
): T[] {
  if (!Array.isArray(items)) return []

  let result = [...items]

  if (options?.filter) {
    result = result.filter(options.filter)
  }

  if (options?.sort) {
    if (typeof options.sort === 'function') {
      result = result.sort(options.sort)
    } else {
      const key = options.sort
      result = result.sort((a, b) => {
        const aVal = a[key]
        const bVal = b[key]
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return aVal - bVal
        }
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return aVal.localeCompare(bVal)
        }
        return 0
      })
    }
  }

  if (options?.limit) {
    result = result.slice(0, options.limit)
  }

  return result
}

// ----------------------------------------
// Schema helpers
// ----------------------------------------

/**
 * Reads the .kern.json schema of a file
 * Returns null if no schema exists
 *
 * @example
 * const schema = getSchema('home', 'hero')
 */
export function getSchema(
  page: string | 'globals',
  section: string
): any | null {
  const basePath = page === 'globals'
    ? join(GLOBALS_PATH, \`\${section}.kern.json\`)
    : join(CONTENT_PATH, page, \`\${section}.kern.json\`)

  try {
    const raw = readFileSync(basePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// ----------------------------------------
// Type helpers
// ----------------------------------------

/**
 * Checks if a value is an image path
 */
export function isImage(value: any): boolean {
  if (typeof value !== 'string') return false
  return /\\.(jpg|jpeg|png|webp|gif|svg|avif)$/i.test(value)
}

/**
 * Checks if a value is a date string
 */
export function isDate(value: any): boolean {
  if (typeof value !== 'string') return false
  return /^\\d{4}-\\d{2}-\\d{2}$/.test(value)
}

/**
 * Formats an ISO date string
 *
 * @example
 * formatDate('2026-04-15') // "4/15/2026"
 * formatDate('2026-04-15', 'long') // "April 15, 2026"
 */
export function formatDate(
  isoDate: string,
  style: 'short' | 'long' = 'short',
  locale: string = 'en-US'
): string {
  try {
    const date = new Date(isoDate)
    if (style === 'long') {
      return date.toLocaleDateString(locale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
    }
    return date.toLocaleDateString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  } catch {
    return isoDate
  }
}

/**
 * Truncates text to a maximum length
 *
 * @example
 * truncate('Long text...', 50)
 */
export function truncate(
  text: string,
  maxLength: number,
  suffix: string = '...'
): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - suffix.length) + suffix
}
`;
