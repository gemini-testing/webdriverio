interface EnhancedHTMLElement extends HTMLElement {
    connectedCallback?(): void;
    disconnectedCallback?(): void;
}

interface CustomElementConstructor {
    new (...params: unknown[]): EnhancedHTMLElement;
}

export default function customElementWrapper () {
    const shadowHosts = new WeakSet<HTMLElement>()
    const registeredHosts = new WeakSet<HTMLElement>()
    const pendingHosts = new Set<WeakRef<HTMLElement>>()

    function registerShadowRoot (host: HTMLElement, allowUnknown = false) {
        if (!host.isConnected || (!allowUnknown && !shadowHosts.has(host)) || registeredHosts.has(host)) {
            return
        }
        let parentNode: ParentNode = host
        while (parentNode.parentNode) {
            parentNode = parentNode.parentNode
        }
        // Register the containing shadow root before its descendants, even if they were
        // constructed in the opposite order while detached.
        if (parentNode instanceof ShadowRoot) {
            registerShadowRoot(parentNode.host as HTMLElement, true)
        }
        console.debug('[WDIO]', 'newShadowRoot', host, parentNode, parentNode === document, document.documentElement)
        registeredHosts.add(host)
    }

    // Regular elements have no connectedCallback. Observe document and shadow-tree
    // insertions so attachShadow() before append() is reported with its real scope.
    const observer = new MutationObserver(() => {
        for (const reference of pendingHosts) {
            const host = reference.deref()
            if (host) {
                registerShadowRoot(host)
            }
            if (!host || host.isConnected) {
                pendingHosts.delete(reference)
            }
        }
    })
    observer.observe(document, { childList: true, subtree: true })

    const origFn = customElements.define.bind(customElements)
    customElements.define = function(name: string, Constructor: CustomElementConstructor, options?: ElementDefinitionOptions) {
        const origConnectedCallback = Constructor.prototype.connectedCallback
        Constructor.prototype.connectedCallback = function(this: HTMLElement) {
            const result = origConnectedCallback?.call(this)
            // Native/declarative roots can predate the attachShadow wrapper. In
            // particular, a closed root cannot be detected through host.shadowRoot.
            registerShadowRoot(this, true)
            return result
        }

        const origDisconnectedCallback = Constructor.prototype.disconnectedCallback
        Constructor.prototype.disconnectedCallback = function(this: HTMLElement) {
            if (registeredHosts.delete(this)) {
                console.debug('[WDIO]', 'removeShadowRoot', this)
            }
            return origDisconnectedCallback?.call(this)
        }
        return origFn(name, Constructor, options)
    }

    const origAttachShadow = Element.prototype.attachShadow
    Element.prototype.attachShadow = function (this: HTMLElement, init: ShadowRootInit) {
        const shadowRoot = origAttachShadow.call(this, init)
        shadowHosts.add(this)
        // A connected, previously rootless custom host may already have been reported.
        registeredHosts.delete(this)
        observer.observe(shadowRoot, { childList: true, subtree: true })
        if (!this.isConnected) {
            pendingHosts.add(new WeakRef(this))
        }
        registerShadowRoot(this)
        return shadowRoot
    }
}
