import * as path from 'path';
import { ExtensionContext, workspace } from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient;

export function activate(context: ExtensionContext) {
  // Path to the server module
  const serverModule = context.asAbsolutePath(
    path.join('..', 'server', 'dist', 'server.js')
  );

  // Server options - run in Node
  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.stdio,
    },
    debug: {
      module: serverModule,
      transport: TransportKind.stdio,
      options: {
        execArgv: ['--nolazy', '--inspect=6009'],
      },
    },
  };

  // Client options
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'lambkin' }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher('**/*.{lambkin,lam}'),
    },
  };

  // Create and start the client
  client = new LanguageClient(
    'lambkin',
    'Lambkin Language Server',
    serverOptions,
    clientOptions
  );

  // Start the client (also starts the server)
  client.start();
}

export function deactivate(): Thenable<void> | undefined {
  if (!client) {
    return undefined;
  }
  return client.stop();
}
