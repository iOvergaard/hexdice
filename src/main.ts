import './style.css';
import { installDebug } from './debug';
import { Controller } from './game/controller';
import { parseUrlParams } from './game/url-params';

const controller = new Controller(document.querySelector<HTMLElement>('#app')!, parseUrlParams(location.search));
if (import.meta.env.DEV) installDebug(controller);
controller.start();
