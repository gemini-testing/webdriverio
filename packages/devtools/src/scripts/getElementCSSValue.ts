export default function getElementCSSValue (_: HTMLElement, elem: HTMLElement, propertyName: string): string {
    /**
     * Have to cast to any due to https://github.com/Microsoft/TypeScript/issues/17827
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (window.getComputedStyle(elem) as any)[propertyName]
}
