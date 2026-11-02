import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import customElementWrapper from '../../src/scripts/customElement.js'

describe('customElementWrapper', () => {
    let dom: JSDOM
    let nativeAttachShadow: typeof Element.prototype.attachShadow

    beforeEach(() => {
        dom = new JSDOM('<!doctype html><html><body></body></html>')
        for (const name of ['customElements', 'Element', 'HTMLElement', 'document', 'MutationObserver', 'ShadowRoot']) {
            vi.stubGlobal(name, dom.window[name as keyof typeof dom.window])
        }
        vi.spyOn(console, 'debug').mockImplementation(() => {})
        nativeAttachShadow = Element.prototype.attachShadow
        customElementWrapper()
    })

    afterEach(() => {
        dom.window.close()
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it.each(['open', 'closed'] as const)('registers a native %s root when its existing host is upgraded', (mode) => {
        const component = document.createElement('native-component')
        nativeAttachShadow.call(component, { mode })
        document.body.appendChild(component)
        class NativeComponent extends HTMLElement {}
        customElements.define('native-component', NativeComponent)
        expect(console.debug).toHaveBeenCalledWith(
            '[WDIO]', 'newShadowRoot', component, document, true, document.documentElement
        )
        expect(console.debug).toHaveBeenCalledTimes(1)
    })

    it('registers a native closed parent before children inserted during its upgrade', () => {
        const parent = document.createElement('native-parent')
        const parentRoot = nativeAttachShadow.call(parent, { mode: 'closed' })
        const child = document.createElement('span')
        child.attachShadow({ mode: 'closed' })
        document.body.appendChild(parent)
        class NativeParent extends HTMLElement {
            connectedCallback () {
                parentRoot.appendChild(child)
                // Synchronously attach a grandchild while the parent's callback runs.
                const grandchild = document.createElement('div')
                parentRoot.appendChild(grandchild)
                grandchild.attachShadow({ mode: 'closed' })
            }
        }
        customElements.define('native-parent', NativeParent)
        expect(vi.mocked(console.debug).mock.calls[0]).toEqual([
            '[WDIO]', 'newShadowRoot', parent, document, true, document.documentElement
        ])
    })

    it('reports a root attached after a rootless custom host was connected', () => {
        class LateComponent extends HTMLElement {}
        customElements.define('late-component', LateComponent)
        const component = new LateComponent()
        document.body.appendChild(component)
        vi.mocked(console.debug).mockClear()
        component.attachShadow({ mode: 'closed' })
        expect(console.debug).toHaveBeenCalledWith(
            '[WDIO]', 'newShadowRoot', component, document, true, document.documentElement
        )
        expect(console.debug).toHaveBeenCalledTimes(1)
    })

    it('registers a constructor-created shadow root only when its host is connected', () => {
        class DetachedComponent extends HTMLElement {
            constructor () {
                super()
                this.attachShadow({ mode: 'closed' })
            }
        }
        customElements.define('detached-component', DetachedComponent)
        const component = new DetachedComponent()
        expect(console.debug).not.toHaveBeenCalled()

        document.body.appendChild(component)
        expect(console.debug).toHaveBeenCalledWith(
            '[WDIO]', 'newShadowRoot', component, document, true, document.documentElement
        )
        expect(console.debug).toHaveBeenCalledTimes(1)
    })

    it('registers a detached regular host after it is inserted into the document', async () => {
        const component = document.createElement('div')
        component.attachShadow({ mode: 'closed' })
        expect(console.debug).not.toHaveBeenCalled()
        document.body.appendChild(component)
        await Promise.resolve()
        expect(console.debug).toHaveBeenCalledWith(
            '[WDIO]', 'newShadowRoot', component, document, true, document.documentElement
        )
    })

    it('registers a shadow root created inside connectedCallback exactly once', () => {
        class ConnectedComponent extends HTMLElement {
            connectedCallback () {
                this.attachShadow({ mode: 'open' })
            }
        }
        customElements.define('connected-component', ConnectedComponent)
        const component = new ConnectedComponent()
        document.body.appendChild(component)
        expect(console.debug).toHaveBeenCalledTimes(1)
        expect(console.debug).toHaveBeenCalledWith(
            '[WDIO]', 'newShadowRoot', component, document, true, document.documentElement
        )
    })

    it('registers a detached host inserted into an existing closed shadow tree', async () => {
        const parent = document.createElement('div')
        document.body.appendChild(parent)
        const parentRoot = parent.attachShadow({ mode: 'closed' })
        const child = document.createElement('span')
        child.attachShadow({ mode: 'closed' })
        vi.mocked(console.debug).mockClear()
        parentRoot.appendChild(child)
        await Promise.resolve()
        expect(console.debug).toHaveBeenCalledWith(
            '[WDIO]', 'newShadowRoot', child, parentRoot, false, document.documentElement
        )
        expect(console.debug).toHaveBeenCalledTimes(1)
    })

    it('registers detached parent shadow trees before their nested hosts', async () => {
        const child = document.createElement('span')
        child.attachShadow({ mode: 'closed' })
        const parent = document.createElement('div')
        const parentRoot = parent.attachShadow({ mode: 'closed' })
        parentRoot.appendChild(child)
        document.body.appendChild(parent)
        await Promise.resolve()
        expect(vi.mocked(console.debug).mock.calls.map((args) => args[2])).toEqual([parent, child])
    })

    it('registers a custom host again after it disconnects and reconnects', () => {
        class ReconnectedComponent extends HTMLElement {
            constructor () {
                super()
                this.attachShadow({ mode: 'closed' })
            }
        }
        customElements.define('reconnected-component', ReconnectedComponent)
        const component = new ReconnectedComponent()
        document.body.appendChild(component)
        component.remove()
        document.body.appendChild(component)
        expect(vi.mocked(console.debug).mock.calls.map((args) => args[1])).toEqual([
            'newShadowRoot', 'removeShadowRoot', 'newShadowRoot'
        ])
    })

    it('continues registering connected hosts when a pending weak reference was collected', async () => {
        // Model collection deterministically: do not depend on when the VM runs GC.
        const pendingReferences: { target?: HTMLElement }[] = []
        vi.stubGlobal('WeakRef', class {
            target?: HTMLElement
            constructor (target: HTMLElement) {
                this.target = target
                pendingReferences.push(this)
            }
            deref () {
                return this.target
            }
        })
        const discarded = document.createElement('div')
        discarded.attachShadow({ mode: 'closed' })
        for (const reference of pendingReferences) {
            reference.target = undefined
        }
        // A collected host must never be queried again by the observer.
        Object.defineProperty(discarded, 'isConnected', {
            get () { throw new Error('queried a collected host') }
        })
        const connected = document.createElement('span')
        connected.attachShadow({ mode: 'closed' })
        document.body.appendChild(connected)
        await Promise.resolve()
        expect(console.debug).toHaveBeenCalledWith(
            '[WDIO]', 'newShadowRoot', connected, document, true, document.documentElement
        )
        expect(console.debug).toHaveBeenCalledTimes(1)
    })

    it('registers shadow roots attached to connected regular elements', () => {
        const component = document.createElement('div')
        document.body.appendChild(component)
        const root = component.attachShadow({ mode: 'open' })
        expect(component.shadowRoot).toBe(root)
        expect(console.debug).toHaveBeenCalledWith(
            '[WDIO]', 'newShadowRoot', component, document, true, document.documentElement
        )
    })
})
