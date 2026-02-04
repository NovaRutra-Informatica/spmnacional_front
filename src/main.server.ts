import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { mergeApplicationConfig } from '@angular/core';
import { provideServerRendering } from '@angular/platform-server';

const serverConfig = { providers: [provideServerRendering()] };

export default function bootstrap(context: any) {
    return bootstrapApplication(
        AppComponent,
        mergeApplicationConfig(appConfig, serverConfig),
        context,
    );
}
