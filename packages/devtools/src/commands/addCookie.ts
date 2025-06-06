import type { Cookie } from '@testplane/wdio-protocols'

import type DevToolsDriver from '../devtoolsdriver.js'

/**
 * The Add Cookie command adds a single cookie to the cookie store
 * associated with the active document's address.
 *
 * @alias browser.addCookie
 * @see https://w3c.github.io/webdriver/#dfn-adding-a-cookie
 * @param {object} cookie  A JSON object representing a cookie. It must have at least the name and value fields and could have more, including expiry-time and so on
 */
export default async function addCookie(
    this: DevToolsDriver,
    { cookie }: { cookie: Cookie }
) {
    const page = this.getPageHandle()

    const cookieProps = Object.keys(cookie)
    if (!cookieProps.includes('name') || !cookieProps.includes('value')) {
        throw new Error(
            'Provided cookie object is missing either "name" or "value" property'
        )
    }

    if (typeof cookie.value !== 'string') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cookie.value = (cookie.value as any).toString()
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.setCookie(cookie as any)
    return null
}
