import {
  Component,
  ElementRef,
  Input,
  Output,
  EventEmitter,
  Inject,
  ViewChild,
  ChangeDetectorRef,
  TemplateRef,
  NgZone,
  Optional,
  ViewContainerRef,
  OnDestroy,
  ChangeDetectionStrategy,
} from '@angular/core';
import { DOCUMENT } from '@angular/platform-browser';
import { Overlay, OverlayRef, OverlayConfig, PositionStrategy, ScrollStrategy } from '@angular/cdk/overlay';
import { TemplatePortal } from '@angular/cdk/portal';
import { Observable } from 'rxjs/Observable';
import { Subscription } from 'rxjs/Subscription';
import { merge } from 'rxjs/observable/merge';
import { fromEvent } from 'rxjs/observable/fromEvent';
import { of as observableOf } from 'rxjs/observable/of';
import { filter } from 'rxjs/operators/filter';
import { first } from 'rxjs/operators/first';
import { switchMap } from 'rxjs/operators/switchMap';

@Component({
  selector: 'novo-overlay-template',
  template: `
    <ng-template>
        <div class="novo-overlay-panel" role="listbox" [id]="id" #panel>
            <ng-content></ng-content>
        </div>
    </ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NovoOverlayTemplate implements OnDestroy {
  public id: string = `novo-overlay-${Date.now()}`;

  @ViewChild(TemplateRef) public template: TemplateRef<any>;
  @ViewChild('panel') public panel: ElementRef;

  @Input() public position: string = 'default';
  @Input() public scrollStrategy: 'reposition' | 'block' | 'close' = 'reposition';
  @Input() public size: string = 'inherit';
  @Input() public closeOnSelect: boolean = true;
  @Input()
  public set parent(value: ElementRef) {
    this._parent = value;
    this.checkSizes();
  }
  public get parent(): ElementRef {
    return this._parent;
  }
  private _parent: ElementRef;

  @Output() public select: EventEmitter<any> = new EventEmitter();
  @Output() public closing: EventEmitter<any> = new EventEmitter();

  public overlayRef: OverlayRef | null;
  public portal: any;
  public _panelOpen: boolean = false;
  public positionStrategy: PositionStrategy;
  public closingActionsSubscription: Subscription;

  constructor(
    private overlay: Overlay,
    private viewContainerRef: ViewContainerRef,
    private zone: NgZone,
    private changeDetectorRef: ChangeDetectorRef,
    @Optional()
    @Inject(DOCUMENT)
    private document: any,
  ) {}

  public ngOnDestroy(): void {
    this.destroyPanel();
  }

  get panelOpen(): boolean {
    return this._panelOpen;
  }

  public openPanel(): void {
    if (!this.overlayRef) {
      this.createOverlay(this.template);
    } else {
      this.checkSizes();
    }
    if (this.overlayRef && !this.overlayRef.hasAttached()) {
      this.overlayRef.attach(this.portal);
      this.closingActionsSubscription = this.subscribeToClosingActions();
    }
    this._panelOpen = true;
    this.changeDetectorRef.markForCheck();
    setTimeout(() => this.overlayRef.updatePosition());
  }

  public closePanel(): void {
    this.zone.run(() => {
      if (this.overlayRef && this.overlayRef.hasAttached()) {
        this.overlayRef.detach();
        this.closingActionsSubscription.unsubscribe();
      }
      this.closing.emit(true);
      if (this._panelOpen) {
        this._panelOpen = false;
        this.changeDetectorRef.markForCheck();
      }
    });
  }

  public onClosingAction(event: any): void {
    this.closePanel();
  }

  public get panelClosingActions(): Observable<any> {
    return merge(this.outsideClickStream);
  }

  private get outsideClickStream(): Observable<any> {
    if (!this.document) {
      return observableOf();
    }

    return merge(fromEvent(this.document, 'click'), fromEvent(this.document, 'touchend')).pipe(
      filter((event: MouseEvent | TouchEvent) => {
        const clickTarget: HTMLElement = event.target as HTMLElement;
        const clicked: boolean =
          this._panelOpen &&
          clickTarget !== this.getConnectedElement().nativeElement &&
          !this.getConnectedElement().nativeElement.contains(clickTarget) &&
          (!!this.overlayRef && !this.overlayRef.overlayElement.contains(clickTarget));
        if (this._panelOpen && !!this.overlayRef && this.overlayRef.overlayElement.contains(clickTarget) && this.closeOnSelect) {
          this.select.emit(event);
        }
        return clicked;
      }),
    );
  }

  private subscribeToClosingActions(): Subscription {
    const firstStable: Observable<any> = this.zone.onStable.asObservable().pipe(first());
    // const valueChanges = Observable.from(this.value);
    // When the zone is stable initially, and when the option list changes...
    return (
      merge(firstStable)
        .pipe(
          // create a new stream of panelClosingActions, replacing any previous streams
          // that were created, and flatten it so our stream only emits closing events...
          switchMap(() => {
            return this.panelClosingActions;
          }),
          // when the first closing event occurs...
          first(),
        )
        // set the value, close the panel, and complete.
        .subscribe((event: any) => this.onClosingAction(event))
    );
  }

  private destroyPanel(): void {
    if (this.overlayRef) {
      this.closePanel();
      this.overlayRef.dispose();
      this.overlayRef = undefined;
    }
  }

  private createOverlay(template: TemplateRef<any>): void {
    this.portal = new TemplatePortal(template, this.viewContainerRef);
    this.overlayRef = this.overlay.create(this.getOverlayConfig());
  }

  private getOverlayConfig(): OverlayConfig {
    const overlayState: OverlayConfig = new OverlayConfig();
    overlayState.positionStrategy = this.getOverlayPosition(this.position);
    if (this.size === 'inherit') {
      overlayState.width = this.getHostWidth();
    }
    overlayState.direction = 'ltr';
    overlayState.scrollStrategy = this.getScrollStrategy();
    return overlayState;
  }

  private getScrollStrategy(): ScrollStrategy {
    switch (this.scrollStrategy) {
      case 'block':
        return this.overlay.scrollStrategies.block();
      case 'reposition':
        return this.overlay.scrollStrategies.reposition();
      default:
        return this.overlay.scrollStrategies.close();
    }
  }

  private getOverlayPosition(position: string): PositionStrategy {
    switch (position) {
      case 'center':
        return this.overlay
          .position()
          .connectedTo(this.getConnectedElement(), { originX: 'start', originY: 'center' }, { overlayX: 'start', overlayY: 'center' })
          .withFallbackPosition({ originX: 'start', originY: 'top' }, { overlayX: 'start', overlayY: 'top' })
          .withFallbackPosition({ originX: 'start', originY: 'bottom' }, { overlayX: 'start', overlayY: 'bottom' });
      default:
        return this.overlay
          .position()
          .connectedTo(this.getConnectedElement(), { originX: 'start', originY: 'bottom' }, { overlayX: 'start', overlayY: 'top' })
          .withFallbackPosition({ originX: 'start', originY: 'top' }, { overlayX: 'start', overlayY: 'bottom' });
    }
  }

  private checkSizes(): void {
    if (this.overlayRef) {
      if (this.size === 'inherit') {
        this.overlayRef.getConfig().width = this.getHostWidth();
      }
      this.overlayRef.updateSize(this.overlayRef.getConfig());
      this.overlayRef.updatePosition();
      this.changeDetectorRef.markForCheck();
    }
  }

  private getConnectedElement(): ElementRef {
    return this.parent;
  }

  private getHostWidth(): number {
    return this.getConnectedElement().nativeElement.getBoundingClientRect().width;
  }
}
