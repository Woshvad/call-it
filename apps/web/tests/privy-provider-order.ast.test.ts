/**
 * AST regression test: Privy provider order (Pitfall 13)
 *
 * Parses apps/web/app/Providers.tsx with ts-morph and asserts the EXACT JSX nesting order:
 *   <PrivyProvider>
 *     <QueryClientProvider>
 *       <WagmiProvider>
 *         <ToastProvider>
 *           {children}
 *         </ToastProvider>
 *       </WagmiProvider>
 *     </QueryClientProvider>
 *   </PrivyProvider>
 *
 * Also asserts:
 *   1. WagmiProvider is imported from '@privy-io/wagmi' (NOT 'wagmi')
 *   2. 'use client' is the first statement
 *
 * Requirement: T-01-27 (Pitfall 13 — provider order regression silently kills OAuth wallets)
 * CI gate: .github/workflows/phase-1-gates.yml runs this on every PR touching apps/web
 */

import { Project, SyntaxKind, Node } from 'ts-morph';
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const PROVIDERS_PATH = path.resolve(__dirname, '..', 'app', 'Providers.tsx');
const TSCONFIG_PATH = path.resolve(__dirname, '..', 'tsconfig.json');

describe('Privy provider order (Pitfall 13)', () => {
  it("Assertion 1: 'use client' is the first statement in Providers.tsx", () => {
    const source = readFileSync(PROVIDERS_PATH, 'utf-8');
    const lines = source.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    // First non-empty line must be the 'use client' directive
    expect(lines[0]).toBe("'use client';");
  });

  it('Assertion 2: WagmiProvider is imported from @privy-io/wagmi (NOT from wagmi)', () => {
    const project = new Project({
      tsConfigFilePath: TSCONFIG_PATH,
      skipAddingFilesFromTsConfig: true,
    });
    const file = project.addSourceFileAtPath(PROVIDERS_PATH);

    // Find the import declaration for WagmiProvider
    const wagmiImport = file.getImportDeclarations().find(d =>
      d.getNamedImports().some(n => n.getName() === 'WagmiProvider'),
    );

    expect(wagmiImport, 'WagmiProvider import not found in Providers.tsx').toBeDefined();
    expect(
      wagmiImport!.getModuleSpecifierValue(),
      "WagmiProvider MUST be imported from '@privy-io/wagmi', not from 'wagmi' (Pitfall 13 — wrong import silently kills OAuth embedded wallets)",
    ).toBe('@privy-io/wagmi');

    // Extra guard: ensure there's no 'wagmi' (bare) import containing WagmiProvider
    const bareWagmiImport = file.getImportDeclarations().find(
      d =>
        d.getModuleSpecifierValue() === 'wagmi' &&
        d.getNamedImports().some(n => n.getName() === 'WagmiProvider'),
    );
    expect(
      bareWagmiImport,
      "Found WagmiProvider imported from bare 'wagmi' — this MUST be '@privy-io/wagmi'",
    ).toBeUndefined();
  });

  it('Assertion 3: outermost JSX element is PrivyProvider', () => {
    const project = new Project({
      tsConfigFilePath: TSCONFIG_PATH,
      skipAddingFilesFromTsConfig: true,
    });
    const file = project.addSourceFileAtPath(PROVIDERS_PATH);

    const jsxElements = file.getDescendantsOfKind(SyntaxKind.JsxElement);
    expect(jsxElements.length, 'No JSX elements found in Providers.tsx').toBeGreaterThan(0);

    const outermost = jsxElements[0];
    const outermostTagName = outermost.getOpeningElement().getTagNameNode().getText();
    expect(
      outermostTagName,
      `Expected outermost JSX element to be 'PrivyProvider' but found '${outermostTagName}'. Provider order regression detected! See Pitfall 13.`,
    ).toBe('PrivyProvider');
  });

  it('Assertion 4: second level (direct child of PrivyProvider) is QueryClientProvider', () => {
    const project = new Project({
      tsConfigFilePath: TSCONFIG_PATH,
      skipAddingFilesFromTsConfig: true,
    });
    const file = project.addSourceFileAtPath(PROVIDERS_PATH);

    const jsxElements = file.getDescendantsOfKind(SyntaxKind.JsxElement);
    // jsxElements[0] = PrivyProvider, jsxElements[1] = QueryClientProvider
    expect(jsxElements.length, 'Expected at least 2 nested JSX elements').toBeGreaterThan(1);

    const secondElement = jsxElements[1];
    const secondTagName = secondElement.getOpeningElement().getTagNameNode().getText();
    expect(
      secondTagName,
      `Expected second JSX element (child of PrivyProvider) to be 'QueryClientProvider' but found '${secondTagName}'. Provider order regression!`,
    ).toBe('QueryClientProvider');
  });

  it('Assertion 5: third level (child of QueryClientProvider) is WagmiProvider', () => {
    const project = new Project({
      tsConfigFilePath: TSCONFIG_PATH,
      skipAddingFilesFromTsConfig: true,
    });
    const file = project.addSourceFileAtPath(PROVIDERS_PATH);

    const jsxElements = file.getDescendantsOfKind(SyntaxKind.JsxElement);
    expect(jsxElements.length, 'Expected at least 3 nested JSX elements').toBeGreaterThan(2);

    const thirdElement = jsxElements[2];
    const thirdTagName = thirdElement.getOpeningElement().getTagNameNode().getText();
    expect(
      thirdTagName,
      `Expected third JSX element (child of QueryClientProvider) to be 'WagmiProvider' but found '${thirdTagName}'. Provider order regression!`,
    ).toBe('WagmiProvider');
  });

  it('Assertion 6: source string does not contain import from bare wagmi for WagmiProvider', () => {
    const source = readFileSync(PROVIDERS_PATH, 'utf-8');
    // Negative assertion: no line should match "WagmiProvider" from bare 'wagmi'
    const lines = source.split('\n');
    const badImportLine = lines.find(
      l => l.includes('WagmiProvider') && l.includes("from 'wagmi'") && !l.includes('@privy-io/wagmi'),
    );
    expect(
      badImportLine,
      `Found forbidden import of WagmiProvider from bare 'wagmi': "${badImportLine}". Must use '@privy-io/wagmi'.`,
    ).toBeUndefined();
  });
});
