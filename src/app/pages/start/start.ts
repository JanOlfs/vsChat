import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/** Schlichter Einstieg, die eigentlichen Modi haben jeweils ihren eigenen Tab. */
@Component({
  selector: 'app-start',
  imports: [RouterLink],
  templateUrl: './start.html',
})
export class Start {}
