import { getBrowserObject } from '@testplane/wdio-utils'
import getPropertyScript from '../../scripts/getProperty.js'

/**
 * The Get Element Property command will return the result of getting a property of an
 * element.
 *
 * <example>
    :getProperty.js
    it('should demonstrate the getProperty command', async () => {
        var elem = await $('body')
        var tag = await elem.getProperty('tagName')
        console.log(tag) // outputs: "BODY"
    })
 * </example>
 *
 * @alias element.getProperty
 * @param {string} property  name of the element property
 * @return {unknown} the value of the property of the selected element
 */
export function getProperty (
    this: WebdriverIO.Element,
    property: string
): Promise<unknown> {
    if (this.isW3C) {
        return this.getElementProperty(this.elementId, property)
    }

    const browser = getBrowserObject(this)
    return browser.execute(
        getPropertyScript,
        { ELEMENT: this.elementId },
        property
    )
}
