import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
register('@node-loader/import-maps', pathToFileURL('./'));
