// This code comes with ABSOLUTELY NO WARRANTY.

import {AngularFirestore, Query, QueryDocumentSnapshot} from "@angular/fire/firestore";
import {BehaviorSubject, Observable} from "rxjs";
import {map, switchMap, tap, filter} from "rxjs/operators";
import firebase = require('firebase/app');
import WhereFilterOp = firebase.firestore.WhereFilterOp;

export type PaginatorActions = 'current' | 'first' | 'prev' | 'next' | 'last' | 'reset';

export interface PaginatorSort {
    field: string;
    direction: 'asc' | 'desc';
}

export interface PaginatorFilter {
    field: string;
    op: WhereFilterOp;
    val: any;
}

export class AngularFirePaginator <T>{
    private readonly path: string;
    private pageSize: number;
    private sort: PaginatorSort[] | null;
    private filter: PaginatorFilter[] | null;
    private stalled = false;
    private debug = false;

    items$: Observable<T[]>;
    private paging$: BehaviorSubject<PaginatorActions | null>;
    private firstItemId: string; // the id of the first record of this query on the first page, used as marker for enabling previous
    private prevAnchor: QueryDocumentSnapshot<any>; // anchor for querying previous page
    private nextAnchor: QueryDocumentSnapshot<any>; // anchor for querying next page

    firstEnabled: boolean = false;
    lastEnabled: boolean = false;
    nextEnabled: boolean = false;
    previousEnabled: boolean = false;

    /**
     * AngularFire-based Paginator.
     *
     * @param fs AngularFire service instance
     * @param path Firebase collection data path
     * @param pageSize Elements per page
     * @param sortOptions Array of sorting criteria
     * @param filterOptions Array of filter criteria
     * @param stalled Sets stalled flag. Useful when you have to wait for other data to load before displaying paginator. The paginator will query after resume() is called.
     * @param debug Turns console logs on or off.
     */

    constructor(private fs: AngularFirestore, path: string, pageSize: number, sortOptions?: PaginatorSort[] | null, filterOptions?: PaginatorFilter[] | null, stalled?: boolean, debug ?: boolean) {
        this.pageSize = pageSize;
        this.path = path;
        this.sort = sortOptions;
        this.filter = filterOptions;
        this.stalled = (stalled === undefined) ? false : stalled;

        this.paging$ = new BehaviorSubject('first');

        this.items$ = this.paging$.pipe(
            tap((action) => {
                this.trace("start ------------------------ ");
                // disable all navigation buttons during query
                this.firstEnabled = this.previousEnabled = this.nextEnabled = this.lastEnabled = false;
                this.trace('page size ', this.pageSize, this.path, action);
            }),
            filter(() => {
                return this.stalled === false;
            }),
            switchMap((pagingAction) =>
                this.fs.collection<any>(this.path, ref => {

                    this.trace("switchMap ------------------------ ");

                    let query = this.applyFilter(ref);
                    query = this.applySort(query);

                    switch (pagingAction) {
                        case 'current':
                            query = this.queryCurrent(query);
                            break;
                        case 'next':
                            query = this.queryNext(query);
                            break;
                        case 'prev':
                            query = this.queryPrev(query);
                            break;
                        case 'last':
                            query = this.queryLast(query);
                            break;
                        case 'first':
                        case 'reset':
                        default:
                            query = this.queryFirst(query);
                            break;
                    }
                    this.trace("query building done ------------------------ ");
                    return query;
                })
                    .snapshotChanges()
                    .pipe(
                        tap(items => {
                            this.trace('snapshot tapper ------------------ ', pagingAction, items.length);
                            if (items.length) {
                                const ps: number = +this.pageSize
                                switch (pagingAction) {
                                    case 'reset':
                                    case 'first':
                                        this.firstItemId = items[0].payload.doc.id;
                                        break;
                                    case 'prev':
                                        // in case of previous: if there are less items than page-size, it means that we reached the
                                        // first page but the paging took place from an item that would usually display itself on the first page.
                                        // e.g. only first 2 items returned because previous was called from item 3 with a page size of 4.
                                        // This  can happen when the user uses prev all the way from the end of the list to the start.
                                        // Forcefully refresh the page to first.
                                        this.nextEnabled = this.lastEnabled = true;
                                        if (items.length < ps + 1) {
                                            this.paginate('reset');
                                            this.trace('enablePrev:', this.previousEnabled, 'items.length', items.length, 'ps', ps, pagingAction);
                                        }
                                        break;
                                    case 'next':
                                        if (items.length < this.pageSize + 1) {
                                            // but only if we are not already on the first page
                                            if (items[0].payload.doc.id !== this.firstItemId) {
                                                this.firstEnabled = this.previousEnabled = true;
                                                this.paginate('last');
                                            }
                                        }
                                        this.trace('enableNext:', this.nextEnabled, 'items.length', items.length, 'ps', ps, pagingAction);
                                        break;
                                    case 'last':
                                        break;
                                }

                                // Check if we have a next page by the number of items.
                                // If we have pagination-size + 1 results, then the next page exists.
                                this.lastEnabled = this.nextEnabled = items.length == ps + 1;

                                // enablePrev if we are not at the very first element
                                // enableFirst is just for convenience. Actually we could do with enablePrev
                                // Todo: what happens if the first element (firstItemId) changes somewhere in between?
                                this.firstEnabled = this.previousEnabled = items[0].payload.doc.id !== this.firstItemId;

                                // remember the anchors for moving to previous and next pages
                                this.prevAnchor = items[1]?.payload.doc; // item[1] because we have to use endBefore for previous and have to query one item extra
                                this.nextAnchor = items.slice(-1)[0].payload.doc; // last item because we have to use startAt for next and queried one item extra only for this purpose
                                // this.trace('Anchor for prev', JSON.stringify(this.currentPrevAnchor.data()), "Anchor for next", JSON.stringify(this.currentNextAnchor.data()));

                            } else {
                                // no items were found for the new page, reset to first. But only if we did not just move to first anyway.
                                if (pagingAction !== 'first' && pagingAction !== 'reset') {
                                    this.paginate('reset');
                                    this.trace('reset');
                                }
                            }
                        }),
                        // snapshotChanges format is rather inconvenient with item.payload.doc.
                        // Since we really just required the document reference for pagination,
                        // therefore map the snapshot item back into a simple data item
                        map(items => items.map((item, index) => {
                            const ps: number = +this.pageSize
                            let i = item.payload.doc.data() as any;
                            // set the display to false for the extra item (that was queried for checking to enable the next button)
                            i.displayInPagination = index < ps;
                            i.id = item.payload.doc.id;
                            return i as any;
                        }))
                    ) // pipe snapshotChanges
            ) // switchMap combineLatest
        ) // pipe combineLatest
    } // constructor


    private queryFirst(query: Query): Query {
        this.trace('first');
        return query.limit(this.pageSize + 1);
    }

    private queryPrev(query: Query): Query {
        this.trace('Prev');
        if (this.prevAnchor) {
            this.trace('endBefore', JSON.stringify(this.prevAnchor.data()));
            return query.endBefore(this.prevAnchor).limitToLast(this.pageSize + 1);
        } else {
            return query.limit(this.pageSize + 1);
        }
    }

    private queryNext(query: Query): Query {
        this.trace('Next');
        if (this.nextAnchor) {
            // query one more item than the pagination size in order to know whether there is a next page.
            this.trace('startAt', JSON.stringify(this.nextAnchor.data()));
            return query.startAt(this.nextAnchor).limit(this.pageSize + 1);
        } else {
            return query.limit(this.pageSize + 1);
        }
    }

    private queryLast(query: Query): Query {
        this.trace('Last');
        return query.limitToLast(this.pageSize);
    }

    private queryCurrent(query: Query): Query {
        this.trace('Current');
        if (this.prevAnchor) {
            this.trace('startAt', JSON.stringify(this.nextAnchor.data()));
            return query.startAt(this.prevAnchor).limit(this.pageSize + 1);
        } else {
            return query.limit(this.pageSize + 1);
        }
    }

    private applySort(query: Query): Query {
        let q = query;
        if (this.sort) {
            this.sort.forEach(s => {
                q = q.orderBy(s.field, s.direction);
                this.trace('orderBy', s.field, s.direction);
            })
        }
        return q;
    }

    private applyFilter(query: Query): Query {
        let q = query;
        if (this.filter) {
            this.filter.forEach( f => {
                q = q.where(f.field, f.op, f.val);
                this.trace('filterBy', f.field, f.op, f.val);
            })
        }
        return q;
    }

    public paginate(action: PaginatorActions) {
        this.paging$.next(action);
    }

    /**
     * Sets all filter criteria.
     *
     * The array structure is used because filters are ordered.
     *
     * @param filter
     */

    public setFilter(filter: PaginatorFilter[] | null) {
        this.filter = filter;
        this.paginate('reset');
    }

    /**
     * Use to update a single filter value.
     *
     * Searches the field in the this.filter array and updates it.
     *
     * @param filter
     */
    public setFilterValue(filter: PaginatorFilter) {
        // search the field to be updated in the array of filters
        this.filter.forEach( (f, i) => {
            if (f.field === filter.field) {
                this.filter[i] = filter;
            }
        })
        this.paginate('reset');
    }

    /**
     * Use to update a single sort value.
     *
     * Searches the field in the this.sort array and updates it.
     *
     * @param sort
     */

    public setSortValue(sort: PaginatorSort) {
        // search the field to be updated in the array of sort
        this.sort.forEach( (f, i) => {
            if (f.field === sort.field) {
                this.sort[i] = sort;
            }
        })
        this.paginate('reset');
    }

    /**
     * Sets all sorting criteria.
     *
     * The array structure is used because sorts are ordered.
     *
     * @param sort
     */
    public setSort(sort: PaginatorSort[] | null) {
        this.sort = sort;
        this.paginate('reset');
    }

    public setPageSize(pageSize: number) {
        this.pageSize = pageSize;
        this.paginate('current');
    }

    private trace(...items: any) {
        if(this.debug) {
            console.log(...items);
        }
    }

    /**
     * call to resume loading documents in paginator.
     * can also be used to reload the current page if joined data was updated by simply calling resume() again.
     */

    public resume() {
        this.setLoadingAndRefresh(false);
    }

    /**
     * call to stall loading documents in paginator.
     */
    public stall() {
        this.setLoadingAndRefresh(true);
    }

    public first() {
        this.paginate("first");
    }

    public last() {
        this.paginate("last")
    }

    public next() {
        this.paginate("next")
    }

    public previous() {
        this.paginate("prev");
    }

    public prev() {
        this.previous();
    }

    private setLoadingAndRefresh(loading: boolean) {
        if (this.stalled) {
            this.trace("loading set to ", loading);
            this.stalled = loading;
            if (!loading) {
                this.paginate('reset');
            }
        } else {
            this.stalled = loading;
            if (!loading) {
                this.paginate('current');
            }
        }
    }
}
