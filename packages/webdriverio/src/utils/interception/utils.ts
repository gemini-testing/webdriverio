import type { local, remote } from '@testplane/webdriver'
import type { BidiResponseMetadata, RequestWithOptions, RespondWithOptions } from './types.js'

type Overwrite = Omit<remote.NetworkContinueRequestParameters & remote.NetworkProvideResponseParameters, 'request'>

/**
 * parse request or response overwrites to make it compatible with Bidis protocol
 * @param overwrite request or response overwrite
 * @returns object to pass to the protocol
 */
export function parseOverwrite(
    overwrite: RequestWithOptions | RespondWithOptions,
    request: local.NetworkBeforeRequestSentParameters | local.NetworkResponseCompletedParameters
): Overwrite {
    const result: Overwrite = {}
    if ('body' in overwrite && (overwrite.body || overwrite.body === '')) {
        const bodyOverwrite = typeof overwrite.body === 'function'
            ? overwrite.body(request as local.NetworkBeforeRequestSentParameters)
            : overwrite.body
        result.body = typeof bodyOverwrite === 'string' ?
            /**
             * if body is a string we can pass it as is
             */
            {
                type: 'string',
                value: bodyOverwrite
            }
            :
            /**
             * if body is an object we need to encode it
             */
            {
                type: 'base64',
                value: globalThis.Buffer
                    ? globalThis.Buffer.from(JSON.stringify(bodyOverwrite || '')).toString('base64')
                    : btoa(JSON.stringify(bodyOverwrite))
            }
    }

    if ('headers' in overwrite) {
        const headersOverwrite = typeof overwrite.headers === 'function'
            ? overwrite.headers(request as local.NetworkBeforeRequestSentParameters & BidiResponseMetadata)
            : overwrite.headers
        result.headers = Object.entries(headersOverwrite || {}).map(([name, value]) => ({
            name,
            value: { type: 'string', value }
        }))
    }

    if ('cookies' in overwrite && overwrite.cookies) {
        const cookieOverwrite = typeof overwrite.cookies === 'function'
            ? overwrite.cookies(request as local.NetworkBeforeRequestSentParameters) || []
            : overwrite.cookies
        result.cookies = cookieOverwrite.map((cookie) => ({
            name: cookie.name,
            value: <remote.NetworkStringValue>{
                type: 'string',
                value: cookie.value
            },
            domain: cookie.domain,
            path: cookie.path,
            expires: cookie.expiry,
            httpOnly: cookie.httpOnly,
            secure: cookie.secure,
            sameSite: cookie.sameSite?.toLowerCase() as remote.NetworkSetCookieHeader['sameSite'],
        }))
    }

    if ('statusCode' in overwrite && overwrite.statusCode) {
        const statusCodeOverwrite = typeof overwrite.statusCode === 'function'
            ? overwrite.statusCode(request as local.NetworkResponseCompletedParameters & BidiResponseMetadata)
            : overwrite.statusCode
        result.statusCode = statusCodeOverwrite
    }

    if ('method' in overwrite) {
        result.method = typeof overwrite.method === 'function'
            ? overwrite.method(request as local.NetworkBeforeRequestSentParameters)
            : overwrite.method
    }

    if ('url' in overwrite) {
        result.url = typeof overwrite.url === 'function'
            ? overwrite.url(request as local.NetworkBeforeRequestSentParameters)
            : overwrite.url
    }

    return result
}

export function getPatternParam (pattern: URLPattern, key: keyof Omit<remote.NetworkUrlPatternPattern, 'type'>) {
    // BiDi compares URL components for equality; it does not evaluate URLPattern syntax.
    // Omit dynamic components and let BidiInterception apply the complete pattern.
    if (/[*():{}+?]/.test(pattern[key])) {
        return
    }

    if (key === 'port' && pattern.port === '') {
        return pattern.protocol === 'https' ? '443' : '80'
    }

    return pattern[key].replaceAll('*', '\\*')
}
